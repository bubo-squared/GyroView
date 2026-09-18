import { HttpRangeSource } from '@gyroview/adapter-fetch';
import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import { WebCodecsVideoDecoderPort } from '@gyroview/adapter-webcodecs';
import {
  detectLensLayout,
  FramePairQueue,
  probeDecoding,
  readRecording,
  seconds,
  Signal,
  type DemuxedInput,
  type FramePair,
  type LensDecodePipeline,
  type LensLayout,
  type Recording,
  type VideoTrackReader,
} from '@gyroview/core';
import { expect, type TestContext } from 'vitest';

import { isServed, type SampleRecording } from './sampleUrls';

const PAIR_TOLERANCE_SECONDS = 0.0005;
const TIMESTAMP_DIGITS = 3;

export const PIPELINE_OPTIONS = {
  maxPendingPackets: 4,
  pairTolerance: seconds(PAIR_TOLERANCE_SECONDS),
};
export const QUEUE_CAPACITY = 4;
export const PROBE_DEADLINE_MS = 15_000;
const POLL_INTERVAL_MS = 20;

export const port = new WebCodecsVideoDecoderPort();

export interface OpenedRecording {
  readonly recording: Recording;
  readonly input: DemuxedInput;
  readonly layout: LensLayout;
  /**
   * Track readers in lens order (lens 0 first), as the layout detector maps them.
   */
  readonly lensTracks: readonly VideoTrackReader[];
  readonly dispose: () => void;
}

export async function openSample(sample: SampleRecording): Promise<OpenedRecording> {
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
    layout,
    lensTracks,
    dispose: (): void => {
      input.dispose();
    },
  };
}

export async function skipUnlessServed(
  context: TestContext,
  sample: SampleRecording,
): Promise<void> {
  if (!(await isServed(sample.url))) context.skip(`${sample.name} is not available locally`);
}

/**
 * Probes the lens tracks; a browser build without an HEVC decoder (Playwright's Chromium) skips
 * the test instead of failing it, any other verdict fails with the probe's details.
 */
export async function skipUnlessDecodable(
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

export function deadlineIn(ms: number): Signal {
  const signal = new Signal();
  setTimeout(() => {
    signal.trigger();
  }, ms);
  return signal;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitFor(
  isSatisfied: () => boolean,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!isSatisfied()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await wait(POLL_INTERVAL_MS);
  }
}

/**
 * Takes the first `count` pairs the pipeline delivers from `from`, then aborts it.
 */
export async function takePairs(
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

export function closeAll(pairs: readonly FramePair<VideoFrame>[]): void {
  for (const pair of pairs) for (const frame of pair.frames) frame.close();
}

export function expectLockstep(
  pairs: readonly FramePair<VideoFrame>[],
  sample: SampleRecording,
): void {
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
      expect(pair.timestamp - previous.timestamp).toBeCloseTo(frameDuration, TIMESTAMP_DIGITS);
    }
  }
}
