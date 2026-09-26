import {
  FramePairQueue,
  hasErrorCode,
  seconds,
  type DecodePipeline,
  type FramePair,
} from '@gyroview/core';
import {
  browserPorts,
  DECODE_PIPELINE_OPTIONS,
  openRecording,
  PAIR_QUEUE_CAPACITY,
  type OpenedRecording,
} from '@gyroview/player/composition';
import { expect, type TestContext } from 'vitest';

import { isServed, type SampleRecording } from './sampleUrls';

const TIMESTAMP_DIGITS = 3;
/**
 * How long a test waits for decoded pairs before it gives up.
 */
export const DECODE_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 20;

const ports = browserPorts();
export const port = ports.decoderPort;

/**
 * A sample opened as the player opens it, or why this run cannot open it.
 */
export type Availability =
  { readonly opened: OpenedRecording } | { readonly unavailableBecause: string };

const NO_HEVC_DECODER = 'this browser build cannot decode the recording (no HEVC decoder)';

/**
 * Opens a sample through the player's own use case, which also proves the recording decodes
 * here. A sample missing locally (as in CI) or a browser build without an HEVC decoder
 * (Playwright's Chromium) makes it unavailable rather than failing.
 */
export async function availabilityOf(sample: SampleRecording): Promise<Availability> {
  if (!(await isServed(sample.url))) {
    return { unavailableBecause: `${sample.name} is not available locally` };
  }
  const source = { main: { url: sample.url }, second: undefined };
  try {
    return { opened: await openRecording(source, ports, new AbortController().signal) };
  } catch (error) {
    if (hasErrorCode(error, 'codec-unsupported')) return { unavailableBecause: NO_HEVC_DECODER };
    throw error;
  }
}

/**
 * The opened sample, or the test skipped with the reason it is unavailable.
 */
export function openedOrSkip(context: TestContext, availability: Availability): OpenedRecording {
  if ('unavailableBecause' in availability) context.skip(availability.unavailableBecause);
  return availability.opened;
}

export async function openSample(
  context: TestContext,
  sample: SampleRecording,
): Promise<OpenedRecording> {
  return openedOrSkip(context, await availabilityOf(sample));
}

function wait(ms: number): Promise<void> {
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
  pipeline: DecodePipeline<VideoFrame>,
  from: number,
  count: number,
): Promise<FramePair<VideoFrame>[]> {
  const queue = new FramePairQueue<VideoFrame>(PAIR_QUEUE_CAPACITY);
  const run = pipeline.run(seconds(from), queue);
  const taken: FramePair<VideoFrame>[] = [];
  await waitFor(
    () => {
      const head = queue.peekTimestamp();
      const pair = head === undefined ? undefined : queue.takePairAt(head);
      if (pair) taken.push(pair);
      return taken.length >= count;
    },
    DECODE_TIMEOUT_MS,
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
    expect(pair.frames.length).toBeGreaterThan(0);
    expect(pair.frames.every((frame) => frame.handle.codedWidth === sample.codedSize)).toBe(true);
    const [first, second] = pair.frames;
    expect(Math.abs((first?.timestamp ?? 0) - (second?.timestamp ?? 0))).toBeLessThan(
      DECODE_PIPELINE_OPTIONS.pairTolerance,
    );
    const previous = pairs[index - 1];
    if (previous) {
      expect(pair.timestamp - previous.timestamp).toBeCloseTo(frameDuration, TIMESTAMP_DIGITS);
    }
  }
}
