import { HttpRangeSource } from '@gyroview/adapter-fetch';
import { MediabunnyAudioSegmenter, MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import { MediaSourceAudioClock } from '@gyroview/adapter-mse-audio';
import { WebCodecsVideoDecoderPort } from '@gyroview/adapter-webcodecs';
import {
  detectLensLayout,
  FramePairQueue,
  LensDecodePipeline,
  PlaybackSession,
  probeDecoding,
  readRecording,
  seconds,
  Signal,
  type DemuxedInput,
  type FramePair,
  type Recording,
  type VideoTrackReader,
} from '@gyroview/core';
import { FakeFrameSink } from '@gyroview/core/testing';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { isServed, OFFICE_5K7_60, SAILING_8K_30, type SampleRecording } from './sampleUrls';

const PIPELINE_OPTIONS = { maxPendingPackets: 4, pairTolerance: seconds(0.0005) };
const QUEUE_CAPACITY = 4;
const PROBE_DEADLINE_MS = 15_000;
const POLL_INTERVAL_MS = 20;
const PRESENTATIONS_BEFORE_SEEK = 30;
const SEEK_TARGET = seconds(120);
const MID_FILE_START = seconds(100);
const PAIRS_TO_TAKE = 20;
const TIMESTAMP_TOLERANCE = 1e-3;
const port = new WebCodecsVideoDecoderPort();

interface OpenedRecording {
  readonly recording: Recording;
  readonly input: DemuxedInput;
  /**
   * Track readers in lens order (lens 0 first), as the layout detector maps them.
   */
  readonly lensTracks: readonly VideoTrackReader[];
  readonly dispose: () => void;
}

async function openSample(sample: SampleRecording): Promise<OpenedRecording> {
  const source = new HttpRangeSource(sample.url);
  const recording = await readRecording(source);
  const input = await new MediabunnyDemuxer().open(source, sample.url);
  const layout = detectLensLayout(
    [{ name: input.name, videoTracks: input.videoTracks.map((track) => track.description) }],
    recording.layoutHints,
  );
  const lensTracks = layout.sources.map((lens) => {
    const track = input.videoTracks[lens.trackIndex];
    if (!track) throw new Error(`layout points at missing track ${lens.trackIndex}`);
    return track;
  });
  return {
    recording,
    input,
    lensTracks,
    dispose: (): void => {
      input.dispose();
    },
  };
}

async function skipUnlessServed(context: TestContext, sample: SampleRecording): Promise<void> {
  if (!(await isServed(sample.url))) context.skip(`${sample.name} is not available locally`);
}

/**
 * Probes the lens tracks; a browser build without an HEVC decoder (Playwright's Chromium) skips
 * the test instead of failing it, any other verdict fails with the probe's details.
 */
async function skipUnlessDecodable(
  context: TestContext,
  lensTracks: readonly VideoTrackReader[],
): Promise<void> {
  const probe = await probeDecoding(lensTracks, port, { deadline: deadlineIn(PROBE_DEADLINE_MS) });
  if (probe.canDecode) return;
  const verdicts = probe.lenses.map((lens) => lens.verdict);
  if (verdicts.every((verdict) => verdict === 'unsupported-configuration')) {
    context.skip('this browser build cannot decode the recording (no HEVC decoder)');
  }
  throw new Error(`the recording does not decode here: ${JSON.stringify(probe.lenses)}`);
}

async function openAudioClock(
  opened: OpenedRecording,
  cleanups: (() => void)[],
): Promise<MediaSourceAudioClock> {
  const [audioTrack] = opened.input.audioTracks;
  if (!audioTrack) throw new Error(`${opened.input.name ?? 'the recording'} has no audio track`);
  const element = document.createElement('audio');
  element.muted = true;
  document.body.append(element);
  cleanups.push(() => {
    element.remove();
  });
  const segments = await new MediabunnyAudioSegmenter().open(audioTrack);
  return MediaSourceAudioClock.open(element, segments, { bufferAhead: seconds(5) });
}

/**
 * Drives the session once per animation frame until the cleanup runs.
 */
function startTicking(session: PlaybackSession<VideoFrame>, cleanups: (() => void)[]): void {
  let isTicking = true;
  cleanups.push(() => {
    isTicking = false;
  });
  const tick = (): void => {
    if (!isTicking) return;
    session.tick();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function expectPictureFollowsSound(sink: FakeFrameSink<VideoFrame>, sample: SampleRecording): void {
  const timestamps = sink.presentations.map((presentation) => presentation.pair.timestamp);
  expect(timestamps).toEqual(timestamps.toSorted((left, right) => left - right));
  const latest = sink.presentations.at(-1);
  if (!latest) throw new Error('nothing was presented');
  expect(latest.pair.timestamp).toBeLessThanOrEqual(latest.mediaTime);
  expect(latest.mediaTime - latest.pair.timestamp).toBeLessThan(3 / sample.frameRate);
}

function deadlineIn(ms: number): Signal {
  const signal = new Signal();
  setTimeout(() => {
    signal.trigger();
  }, ms);
  return signal;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(isSatisfied: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!isSatisfied()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await wait(POLL_INTERVAL_MS);
  }
}

/**
 * Takes the first `count` pairs the pipeline delivers, then stops it.
 */
async function takePairs(
  pipeline: LensDecodePipeline<VideoFrame>,
  from: number,
  count: number,
): Promise<FramePair<VideoFrame>[]> {
  const queue = new FramePairQueue<VideoFrame>(QUEUE_CAPACITY);
  const run = pipeline.run(seconds(from), queue);
  const taken: FramePair<VideoFrame>[] = [];
  await waitFor(
    () => {
      const head = queue.peekTimestamp();
      const pair = head === undefined ? undefined : queue.takePairAt(head);
      if (pair) taken.push(pair);
      return taken.length >= count;
    },
    PROBE_DEADLINE_MS,
    `${count} decoded pairs`,
  );
  pipeline.abort();
  await run;
  return taken;
}

function closeAll(pairs: readonly FramePair<VideoFrame>[]): void {
  for (const pair of pairs) for (const frame of pair.frames) frame.close();
}

function expectLockstep(pairs: readonly FramePair<VideoFrame>[], sample: SampleRecording): void {
  const frameDuration = 1 / sample.frameRate;
  for (const [index, pair] of pairs.entries()) {
    expect(pair.frames).toHaveLength(2);
    expect(pair.frames.map((frame) => frame.handle.codedWidth)).toEqual([
      sample.codedSize,
      sample.codedSize,
    ]);
    const [first, second] = pair.frames;
    expect(Math.abs((first?.timestamp ?? 0) - (second?.timestamp ?? 0))).toBeLessThan(
      PIPELINE_OPTIONS.pairTolerance,
    );
    const previous = pairs[index - 1];
    if (previous) {
      expect(pair.timestamp - previous.timestamp).toBeCloseTo(frameDuration, 3);
    }
  }
}

describe('the browser pipeline on the real X5 recordings', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  it('reads the office recording over HTTP ranges and decodes both lenses in lockstep from a mid-file time', async (context) => {
    await skipUnlessServed(context, OFFICE_5K7_60);
    const opened = await openSample(OFFICE_5K7_60);
    cleanups.push(opened.dispose);
    expect(opened.recording.info.model).toBe('Insta360 X5');
    expect(opened.lensTracks).toHaveLength(2);
    await skipUnlessDecodable(context, opened.lensTracks);

    const pipeline = new LensDecodePipeline<VideoFrame>(opened.lensTracks, port, PIPELINE_OPTIONS);
    const pairs = await takePairs(pipeline, MID_FILE_START, PAIRS_TO_TAKE);
    try {
      const first = pairs[0]?.timestamp ?? NaN;
      expect(first).toBeLessThanOrEqual(MID_FILE_START + TIMESTAMP_TOLERANCE);
      expect(first).toBeGreaterThan(MID_FILE_START - 1 / OFFICE_5K7_60.frameRate);
      expectLockstep(pairs, OFFICE_5K7_60);
    } finally {
      closeAll(pairs);
    }
  });

  it('plays the office recording through the session in step with its own audio and follows a seek', async (context) => {
    await skipUnlessServed(context, OFFICE_5K7_60);
    const opened = await openSample(OFFICE_5K7_60);
    cleanups.push(opened.dispose);
    await skipUnlessDecodable(context, opened.lensTracks);
    const clock = await openAudioClock(opened, cleanups);
    const sink = new FakeFrameSink<VideoFrame>();
    const session = new PlaybackSession<VideoFrame>({
      lensTracks: opened.lensTracks,
      decoderPort: port,
      clock,
      sink,
      duration: opened.input.duration,
      frameTimes: undefined,
      pipeline: PIPELINE_OPTIONS,
      queueCapacity: QUEUE_CAPACITY,
    });
    cleanups.push(() => {
      session.dispose();
    });
    startTicking(session, cleanups);

    await session.play();
    await waitFor(
      () => sink.presentations.length >= PRESENTATIONS_BEFORE_SEEK,
      PROBE_DEADLINE_MS,
      'the first presentations',
    );
    expectPictureFollowsSound(sink, OFFICE_5K7_60);
    expect(clock.failure).toBeUndefined();

    session.seek(SEEK_TARGET);
    await waitFor(
      () => (sink.lastTimestamp ?? 0) >= SEEK_TARGET - 1 / OFFICE_5K7_60.frameRate,
      PROBE_DEADLINE_MS,
      'a frame at the seek target',
    );
    expect(session.state).toBe('playing');
    expect(clock.currentTime).toBeGreaterThanOrEqual(SEEK_TARGET);
    expect(clock.currentTime).toBeLessThan(SEEK_TARGET + 2);
  });

  it('probes and decodes the first frames of the 8K sailing recording', async (context) => {
    await skipUnlessServed(context, SAILING_8K_30);
    const opened = await openSample(SAILING_8K_30);
    cleanups.push(opened.dispose);
    await skipUnlessDecodable(context, opened.lensTracks);

    const pipeline = new LensDecodePipeline<VideoFrame>(opened.lensTracks, port, PIPELINE_OPTIONS);
    const pairs = await takePairs(pipeline, 0, 5);
    try {
      expect(pairs[0]?.timestamp).toBeCloseTo(0, 3);
      expectLockstep(pairs, SAILING_8K_30);
    } finally {
      closeAll(pairs);
    }
  });
});
