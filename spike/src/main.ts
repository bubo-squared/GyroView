// Phase 0 spike entry point: runs each feasibility check in order and records the outcome.
import { probeDecoderSupport } from './decoderSupport';
import { GlPreview } from './glPreview';
import { decodeInLockstep } from './lockstepDecoder';
import {
  describeTrack,
  openRecording,
  serializableConfig,
  type OpenedRecording,
  type TrackDescription,
} from './recording';
import { finish, log, record, recordFailure } from './report';
import { measureSeek } from './seekTest';
import { testVideoElement } from './videoElementTest';

const DEFAULT_DECODE_SECONDS = 10;
const DEFAULT_SEEK_TARGET = 100;
const DECODE_START = 0;

interface SpikeParameters {
  src: string;
  seconds: number;
  seekTarget: number;
}

function readParameters(): SpikeParameters {
  const params = new URLSearchParams(location.search);
  const src = params.get('src');
  if (!src) throw new Error('missing ?src=<url of .insv>');
  return {
    src,
    seconds: Number(params.get('seconds') ?? DEFAULT_DECODE_SECONDS),
    seekTarget: Number(params.get('seek') ?? DEFAULT_SEEK_TARGET),
  };
}

/** Runs one check; records `describe(value)` (or the value itself) so non-serializable objects stay out of the report. */
async function step<T>(
  name: string,
  work: () => Promise<T>,
  describe: (value: T) => unknown = (value) => value,
): Promise<T | undefined> {
  try {
    const value = await work();
    record(name, describe(value));
    return value;
  } catch (error) {
    recordFailure(name, error);
    return undefined;
  }
}

function summarizeRecording(recording: OpenedRecording): Record<string, unknown> {
  return {
    format: recording.formatName,
    duration: recording.duration,
    videoTracks: recording.videoTracks.length,
    audioTracks: recording.audioTrackCount,
  };
}

function summarizeTrack(description: TrackDescription): Record<string, unknown> {
  return { ...description, decoderConfig: serializableConfig(description.decoderConfig) };
}

async function run(): Promise<void> {
  const parameters = readParameters();
  log(`source: ${parameters.src}`);

  const recording = await step('open', () => openRecording(parameters.src), summarizeRecording);
  if (!recording) return;

  const descriptions: TrackDescription[] = [];
  for (const track of recording.videoTracks) {
    const description = await step(`track ${track.id}`, () => describeTrack(track), summarizeTrack);
    if (description) descriptions.push(description);
  }

  for (const [index, track] of recording.videoTracks.entries()) {
    const description = descriptions[index];
    const config = await track.getDecoderConfig();
    if (!description || !config || !description.codecString) continue;
    const bitrate = (await track.getAverageBitrate()) ?? 0;
    await step(`support track ${track.id}`, () =>
      probeDecoderSupport(config, {
        codecString: description.codecString!,
        bitrate,
        framerate: description.averageFps,
      }),
    );
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#preview');
  if (!canvas) throw new Error('missing preview canvas');
  const preview = new GlPreview(canvas);
  await step('lockstep decode', () =>
    decodeInLockstep(recording.videoTracks, {
      startTimestamp: DECODE_START,
      seconds: parameters.seconds,
      onPair: (pair) => {
        preview.uploadAndDraw(pair.frames);
        for (const frame of pair.frames) frame.close();
      },
    }),
  );
  record('gl upload', preview.report());

  const firstTrack = recording.videoTracks[0];
  if (firstTrack) await step('seek', () => measureSeek(firstTrack, parameters.seekTarget));

  await step('video element', () => testVideoElement(parameters.src));
  recording.input.dispose();
}

run()
  .catch((error) => recordFailure('run', error))
  .finally(finish);
