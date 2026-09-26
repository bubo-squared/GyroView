import { describe, expect, it } from 'vitest';

import type { FramePair } from '../../ports/FramePair';
import { FramePairQueue } from './FramePairQueue';
import { DecodePipeline } from './DecodePipeline';
import { seconds } from '../../shared/units/time';
import { fakeFrameNumberOf, FakeVideoTrack } from '../../testing/FakeVideoTrack';
import type { VideoDecoderConfiguration } from '../../ports/VideoTrack';
import type {
  VideoDecoderCallbacks,
  VideoDecoderHandle,
  VideoDecoderPort,
} from '../../ports/VideoDecoderPort';
import { GyroViewError } from '../../shared/errors/GyroViewError';
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

/**
 * A run whose rejection the test asserts separately.
 */
async function swallow(run: Promise<unknown>): Promise<void> {
  try {
    await run;
  } catch {
    // asserted by the test
  }
}

function closeLast(taken: readonly FramePair<FakeFrameHandle>[]): void {
  const frames = taken.at(-1)?.frames ?? [];
  for (const frame of frames) frame.close();
}

describe('DecodePipeline', () => {
  it('decodes both lenses in lockstep and delivers every pair in order from the start', async () => {
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
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
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
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
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
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
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
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
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(0), queue);
    await new Promise((resolve) => setTimeout(resolve, 5));
    pipeline.abort();
    const report = await run;
    queue.close();

    expect(report.hasReachedEnd).toBe(false);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('ends when the shorter track runs out and closes the longer track leftovers', async () => {
    const [front] = twoLensTracks(FRAMES);
    const [back] = twoLensTracks(FRAMES - 5);
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new DecodePipeline([front!, back!], decoderPort, OPTIONS);
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
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);
    queue.close();

    const report = await pipeline.run(seconds(0), queue);

    expect(report.hasReachedEnd).toBe(false);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('rejects construction without any lens track', () => {
    expect(() => new DecodePipeline([], new FakeVideoDecoderPort(), OPTIONS)).toThrow(
      expect.objectContaining({ code: 'invariant-violation' }) as Error,
    );
  });

  it('rejects when a decoder fails mid-stream, closing every decoder and frame', async () => {
    const decoderPort = new FakeVideoDecoderPort({ ...DECODER_LATENCY, failAtPacket: 15 });
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(0), queue);
    const pairs = await drain(queue, swallow(run));
    await expect(run).rejects.toMatchObject({ code: 'decode' });

    expect(pairs.length).toBeLessThan(FRAMES);
    expect(decoderPort.openDecoders).toBe(0);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('rejects when a decoder fails on its very last packet instead of reporting success', async () => {
    const decoderPort = new FakeVideoDecoderPort({ ...DECODER_LATENCY, failAtPacket: FRAMES });
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(0), queue);
    const pairs = await drain(queue, swallow(run));
    await expect(run).rejects.toMatchObject({ code: 'decode' });
    expect(pairs).toHaveLength(FRAMES - 1);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('closes the decoders it opened when another lens refuses to open', async () => {
    const decoderPort = new RefusingSecondLensPort();
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    await expect(pipeline.run(seconds(0), queue)).rejects.toMatchObject({
      code: 'codec-unsupported',
    });
    expect(decoderPort.inner.decodersCreated).toHaveLength(1);
    expect(decoderPort.inner.openDecoders).toBe(0);
  });

  it('rejects with no-key-frame when a track has no key frame', async () => {
    const pipeline = new DecodePipeline(
      twoLensTracks(0),
      new FakeVideoDecoderPort(DECODER_LATENCY),
      OPTIONS,
    );
    await expect(
      pipeline.run(seconds(0), new FramePairQueue<FakeFrameHandle>(4)),
    ).rejects.toMatchObject({ code: 'no-key-frame' });
  });

  it('delivers the last pair of the track when started past its last frame', async () => {
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(3.5), queue);
    const pairs = await drain(queue, run);
    const report = await run;

    expect(pairs.map((pair) => pair.timestamp)).toEqual([expect.closeTo(2.9, 9) as number]);
    expect(report).toMatchObject({
      pairsDelivered: 1,
      pairsDroppedBeforeStart: 9,
      hasReachedEnd: true,
    });
    expect(decoderPort.openFrames).toBe(0);
  });

  it('aborted before running, it ends at once without decoding and closes its decoders', async () => {
    const decoderPort = new FakeVideoDecoderPort(DECODER_LATENCY);
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    pipeline.abort();

    const report = await pipeline.run(seconds(0), new FramePairQueue<FakeFrameHandle>(4));

    expect(report).toMatchObject({ packetsDecoded: 0, pairsDelivered: 0, hasReachedEnd: false });
    expect(decoderPort.openDecoders).toBe(0);
  });

  it('an abort resets the decoders instead of draining them', async () => {
    const decoderPort = new FakeVideoDecoderPort({ latencyTicks: 6 });
    const pipeline = new DecodePipeline(twoLensTracks(), decoderPort, OPTIONS);
    const queue = new FramePairQueue<FakeFrameHandle>(4);

    const run = pipeline.run(seconds(0), queue);
    await new Promise((resolve) => setTimeout(resolve, 1));
    pipeline.abort();
    const report = await run;

    expect(report.hasReachedEnd).toBe(false);
    expect(decoderPort.decodersCreated.every((decoder) => decoder.resetCount === 1)).toBe(true);
    expect(decoderPort.openDecoders).toBe(0);
    queue.close();
    expect(decoderPort.openFrames).toBe(0);
  });

  it('runs only once', async () => {
    const pipeline = new DecodePipeline(
      twoLensTracks(),
      new FakeVideoDecoderPort(DECODER_LATENCY),
      OPTIONS,
    );
    pipeline.abort();
    await pipeline.run(seconds(0), new FramePairQueue<FakeFrameHandle>(4));
    await expect(
      pipeline.run(seconds(0), new FramePairQueue<FakeFrameHandle>(4)),
    ).rejects.toMatchObject({ code: 'invariant-violation' });
  });
});

/**
 * Opens the first lens through the fake port and refuses the second, like a platform out of
 * hardware decoder instances.
 */
class RefusingSecondLensPort implements VideoDecoderPort<FakeFrameHandle> {
  public readonly inner = new FakeVideoDecoderPort(DECODER_LATENCY);
  private created = 0;

  public isSupported(configuration: VideoDecoderConfiguration): Promise<boolean> {
    return this.inner.isSupported(configuration);
  }

  public create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<FakeFrameHandle>,
  ): Promise<VideoDecoderHandle> {
    this.created += 1;
    return this.created === 1
      ? this.inner.create(configuration, callbacks)
      : Promise.reject(new GyroViewError('codec-unsupported', 'no second decoder instance'));
  }
}
