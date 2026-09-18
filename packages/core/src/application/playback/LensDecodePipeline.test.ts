import { describe, expect, it } from 'vitest';

import type { FramePair } from './FramePair';
import { FramePairQueue } from './FramePairQueue';
import { LensDecodePipeline } from './LensDecodePipeline';
import { seconds } from '../../shared/units/time';
import { fakeFrameNumberOf, FakeVideoTrack } from '../../testing/FakeVideoTrack';
import { FakeVideoDecoderPort, type FakeFrameHandle } from '../../testing/FakeVideoDecoderPort';

const FRAME_RATE = 10;
const FRAMES = 30;
const GOP = 10;
const OPTIONS = { maxPendingPackets: 3, pairTolerance: seconds(0.0001) };
const DECODER_LATENCY = { latencyTicks: 2 };

function twoLensTracks(frameCount = FRAMES): FakeVideoTrack[] {
  return [0, 1].map(
    (trackIndex) =>
      new FakeVideoTrack({ trackIndex, frameRate: FRAME_RATE, frameCount, framesPerGop: GOP }),
  );
}

/**
 * Consumes pairs in order as they arrive, closing each one once the next is taken, until the
 * pipeline run settles.
 */
async function drain(
  queue: FramePairQueue<FakeFrameHandle>,
  run: Promise<unknown>,
): Promise<FramePair<FakeFrameHandle>[]> {
  const taken: FramePair<FakeFrameHandle>[] = [];
  const state = { isRunning: true };
  void run.finally(() => {
    state.isRunning = false;
  });
  while (state.isRunning || queue.length > 0) {
    const head = queue.peekTimestamp();
    const pair = head === undefined ? undefined : queue.takePairAt(head);
    if (pair) {
      closeLast(taken);
      taken.push(pair);
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  closeLast(taken);
  return taken;
}

function closeLast(taken: readonly FramePair<FakeFrameHandle>[]): void {
  const frames = taken.at(-1)?.frames ?? [];
  for (const frame of frames) frame.close();
}

describe('LensDecodePipeline', () => {
  it('decodes both lenses in lockstep and delivers every pair in order from the start', async () => {
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new LensDecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(0), queue);
    const pairs = await drain(queue, run);
    const report = await run;

    expect(pairs).toHaveLength(FRAMES);
    expect(pairs.map((pair) => fakeFrameNumberOf(pair.frames[0]!.handle.packetData))).toEqual(
      Array.from({ length: FRAMES }, (_unused, frame) => frame),
    );
    expect(pairs.every((pair) => pair.frames.length === 2)).toBe(true);
    expect(report).toMatchObject({
      packetsDecoded: FRAMES * 2,
      pairsDelivered: FRAMES,
      unpairedFrames: 0,
      pairsDroppedBeforeStart: 0,
      hasReachedEnd: true,
    });
    expect(decoderPort.openFrames).toBe(0);
  });

  it('starts at the preceding key frame and keeps only the last pair before the requested time', async () => {
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new LensDecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(1.25), queue);
    const pairs = await drain(queue, run);
    const report = await run;

    expect(pairs[0]?.timestamp).toBeCloseTo(1.2, 9);
    expect(pairs).toHaveLength(18);
    expect(report.pairsDroppedBeforeStart).toBe(2);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('never lets a decoder hold more than the configured pending packets', async () => {
    const decoderPort = new FakeVideoDecoderPort({ latencyTicks: 4 });
    const pipeline = new LensDecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(8);

    const run = pipeline.run(seconds(0), queue);
    await drain(queue, run);
    await run;

    for (const decoder of decoderPort.decodersCreated) {
      expect(decoder.maxPendingSeen).toBeLessThanOrEqual(OPTIONS.maxPendingPackets);
    }
  });

  it('pauses when the pair queue is full and resumes as pairs are consumed', async () => {
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new LensDecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(2);

    const run = pipeline.run(seconds(0), queue);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(queue.length).toBeLessThanOrEqual(2 + OPTIONS.maxPendingPackets);
    expect(decoderPort.framesCreated.length).toBeLessThan(FRAMES * 2);

    const pairs = await drain(queue, run);
    expect(pairs).toHaveLength(FRAMES);
  });

  it('stops cleanly mid-stream without leaking frames', async () => {
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new LensDecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(0), queue);
    await new Promise((resolve) => setTimeout(resolve, 5));
    pipeline.stop();
    const report = await run;
    queue.close();

    expect(report.hasReachedEnd).toBe(false);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('ends when the shorter track runs out and closes the longer track leftovers', async () => {
    const [front] = twoLensTracks(FRAMES);
    const [back] = twoLensTracks(FRAMES - 5);
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new LensDecodePipeline([front!, back!], decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(0), queue);
    const pairs = await drain(queue, run);
    const report = await run;

    expect(pairs).toHaveLength(FRAMES - 5);
    expect(report.hasReachedEnd).toBe(true);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('stops feeding once the output queue is closed', async () => {
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new LensDecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);
    queue.close();

    const report = await pipeline.run(seconds(0), queue);

    expect(report.hasReachedEnd).toBe(false);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('rejects construction without any lens track', () => {
    expect(() => new LensDecodePipeline([], new FakeVideoDecoderPort(), OPTIONS)).toThrow(
      expect.objectContaining({ code: 'invariant-violation' }) as Error,
    );
  });
});
