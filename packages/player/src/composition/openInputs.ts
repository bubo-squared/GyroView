import {
  detectLensLayout,
  ensureInvariant,
  GyroViewError,
  hasErrorCode,
  lensFrameOrder,
  readRecording,
  seconds,
  timeRecording,
  type DemuxedInput,
  type FrameSourceKey,
  type LayoutHints,
  type RandomAccessSource,
  type Recording,
  type RecordingTiming,
  type Seconds,
  type VideoTrackReader,
} from '@gyroview/core';

import { Disposables } from './Disposables';
import { ensureDecodable } from './ensureDecodable';
import type { OpenAttempt } from './OpenAttempt';
import type { OpenedRecording } from './OpenedRecording';
import type { RecordingPorts } from './ports';
import type { PlayerMetadata } from '../PlayerMetadata';
import { inputName, type MediaInput } from '../PlayerSource';

interface Opening {
  readonly input: MediaInput;
  readonly source: RandomAccessSource;
}

interface DemuxedRecording {
  readonly recording: Recording;
  readonly inputs: readonly DemuxedInput[];
}

/**
 * Opens the given inputs as one recording, its metadata from the input that carries the
 * trailer. Everything opened is released again when any step fails or the attempt is aborted.
 */
export async function openInputs(
  inputs: readonly MediaInput[],
  attempt: OpenAttempt,
): Promise<OpenedRecording> {
  const disposables = new Disposables();
  try {
    const demuxed = await demuxInputs(inputs, attempt, disposables);
    const layout = detectLensLayout(demuxed.inputs, demuxed.recording.info);
    const frameSources = lensFrameOrder(layout).map((key) => trackAt(demuxed.inputs, key));
    const calibration = calibrationOf(demuxed.recording);
    await ensureDecodable(frameSources, attempt);
    const timing = await timeRecording(demuxed.recording, frameSources[0]);
    attempt.signal.throwIfAborted();
    return assemble({ demuxed, layout, frameSources, calibration, timing }, disposables);
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}

async function demuxInputs(
  inputs: readonly MediaInput[],
  attempt: OpenAttempt,
  disposables: Disposables,
): Promise<DemuxedRecording> {
  const { ports, signal } = attempt;
  const given = inputs.map((input) => ({
    input,
    source: ports.sources.open(input, signal).source,
  }));
  const recording = await readRecordingOf(given, ports);
  signal.throwIfAborted();
  const openings = [...given, ...(await declaredSecond(given, recording, attempt))];
  const settled = await Promise.allSettled(
    openings.map(({ input, source }) => ports.demuxer.open(source, inputName(input))),
  );
  const opened = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  for (const input of opened) {
    disposables.add(() => {
      input.dispose();
    });
  }
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  signal.throwIfAborted();
  return { recording, inputs: opened };
}

/**
 * The other lens file a lone file's info record says the recording is split into, when the
 * server has it: found before the lone file's tracks are read, which finding it only once they
 * fell short would read twice. A file that does not say so still gets its sibling looked for
 * once its tracks fall short (see openRecording).
 */
async function declaredSecond(
  given: readonly Opening[],
  recording: Recording,
  attempt: OpenAttempt,
): Promise<Opening[]> {
  const isDeclaredSplit = given.length === 1 && recording.info.fileLayout === 'split-files';
  if (!isDeclaredSplit || !attempt.findSecondFile) return [];
  const input = await attempt.findSecondFile();
  attempt.signal.throwIfAborted();
  return input === undefined
    ? []
    : [{ input, source: attempt.ports.sources.open(input, attempt.signal).source }];
}

/**
 * The layout hints of a file without an info record: the tracks alone decide.
 */
const NO_HINTS: LayoutHints = { fileLayout: undefined, trackOrder: undefined };

async function readRecordingOf(
  openings: readonly Opening[],
  ports: RecordingPorts,
): Promise<Recording> {
  try {
    return await readTrailerCarrier(openings.map(({ source }) => source));
  } catch (error) {
    const [only] = openings;
    const isLoneFileWithoutTrailer =
      openings.length === 1 && hasErrorCode(error, 'invalid-trailer');
    if (isLoneFileWithoutTrailer && only) await refuseAsLoneHalf(only, ports);
    throw error;
  }
}

/**
 * A file without a trailer may be the _10_ half of an older camera's pair, which writes the
 * trailer to _00_ alone: its one square track tells, and the refusal asks for the other file
 * instead of calling it damaged. Anything else leaves the trailer's own refusal standing.
 */
async function refuseAsLoneHalf(opening: Opening, ports: RecordingPorts): Promise<void> {
  let input: DemuxedInput;
  try {
    input = await ports.demuxer.open(opening.source, inputName(opening.input));
  } catch {
    return;
  }
  try {
    detectLensLayout([input], NO_HINTS);
  } catch (error) {
    if (hasErrorCode(error, 'missing-second-file')) throw error;
  } finally {
    input.dispose();
  }
}

/**
 * The recording read from the input that carries the trailer: the first, or the second when the
 * first has none, as the _10_ file of an older camera's pair, which writes it to _00_ alone,
 * when the pair is given the other way round.
 */
async function readTrailerCarrier(sources: readonly RandomAccessSource[]): Promise<Recording> {
  const [first, second] = sources;
  ensureInvariant(first !== undefined, 'a recording needs at least one input');
  try {
    return await readRecording(first);
  } catch (error) {
    if (second === undefined || !hasErrorCode(error, 'invalid-trailer')) throw error;
    return readRecording(second);
  }
}

function trackAt(inputs: readonly DemuxedInput[], key: FrameSourceKey): VideoTrackReader {
  const track = inputs[key.inputIndex]?.videoTracks[key.trackIndex];
  ensureInvariant(
    track !== undefined,
    `the layout points at track ${key.trackIndex} of input ${key.inputIndex}, which does not exist`,
  );
  return track;
}

function calibrationOf(recording: Recording): OpenedRecording['calibration'] {
  const { calibration, warnings } = recording.calibration;
  if (calibration) return calibration;
  const detail = warnings.length > 0 ? ` (${warnings.join('; ')})` : '';
  throw new GyroViewError(
    'no-calibration',
    `the recording carries no usable lens calibration, so it cannot be stitched${detail}`,
  );
}

interface AssemblyParts {
  readonly demuxed: DemuxedRecording;
  readonly layout: OpenedRecording['layout'];
  readonly frameSources: readonly VideoTrackReader[];
  readonly calibration: OpenedRecording['calibration'];
  readonly timing: RecordingTiming;
}

function assemble(parts: AssemblyParts, disposables: Disposables): OpenedRecording {
  const { demuxed, layout, frameSources, calibration, timing } = parts;
  const duration = seconds(Math.min(...demuxed.inputs.map((input) => input.duration)));
  // Whichever file carries the sound: a split pair given either way round still plays it.
  const [audioTrack] = demuxed.inputs.flatMap((input) => input.audioTracks);
  return {
    recording: demuxed.recording,
    layout,
    frameSources,
    calibration,
    duration,
    frameTimes: timing.frameTimes,
    motion: timing.motion,
    audioTrack,
    metadata: metadataOf(parts, duration, audioTrack !== undefined),
    warnings: timing.warnings,
    dispose: disposables.toDisposer(),
  };
}

function metadataOf(parts: AssemblyParts, duration: Seconds, hasAudio: boolean): PlayerMetadata {
  const { info } = parts.demuxed.recording;
  const { motion } = parts.timing;
  return {
    model: info.model,
    firmware: info.firmware,
    captureMode: info.captureMode,
    layout: parts.layout.kind,
    layoutEvidence: parts.layout.evidence,
    tracks: parts.frameSources.map((track) => track.description),
    calibrationVersion: parts.calibration.version,
    frameTimeSource: parts.timing.frameTimeSource,
    hasGyro: motion !== undefined,
    imuFrame: motion && { name: motion.imuFrame.name, isVerified: motion.imuFrame.isVerified },
    hasAudio,
    duration,
  };
}
