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
 * Opens a sample as the player does, through its own use case, which also proves the recording
 * decodes here. A browser build without an HEVC decoder (Playwright's Chromium) skips the test
 * instead of failing it.
 */
export async function openSample(
  context: TestContext,
  sample: SampleRecording,
): Promise<OpenedRecording> {
  const source = {
    main: { url: sample.url },
    second: undefined,
    proxy: undefined,
    shouldDiscoverProxy: false,
    quality: 'full',
  } as const;
  try {
    return await openRecording(source, ports, new AbortController().signal);
  } catch (error) {
    if (hasErrorCode(error, 'codec-unsupported')) {
      context.skip('this browser build cannot decode the recording (no HEVC decoder)');
    }
    throw error;
  }
}

export async function skipUnlessServed(
  context: TestContext,
  sample: SampleRecording,
): Promise<void> {
  if (!(await isServed(sample.url))) context.skip(`${sample.name} is not available locally`);
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
