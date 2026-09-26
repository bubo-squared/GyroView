import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import {
  FramePairQueue,
  LensDecodePipeline,
  seconds,
  type DemuxedInput,
  type EncodedVideoPacket,
  type FramePair,
  type VideoDecoderCallbacks,
  type VideoDecoderConfiguration,
  type VideoDecoderHandle,
  type VideoDecoderPort,
} from '@gyroview/core';
import { InMemoryRandomAccessSource } from '@gyroview/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WebCodecsVideoDecoderPort } from './WebCodecsVideoDecoderPort';
import fixtureUrl from '../../../../test/fixtures/synthetic/dual-track-64px-10fps-3s.mp4?url';

const FRAMES = 30;
const PIPELINE_OPTIONS = { maxPendingPackets: 4, pairTolerance: seconds(0.0001) };
const port = new WebCodecsVideoDecoderPort({ hardwareAcceleration: 'no-preference' });

async function drain(
  queue: FramePairQueue<VideoFrame>,
  run: Promise<unknown>,
): Promise<FramePair<VideoFrame>[]> {
  const taken: FramePair<VideoFrame>[] = [];
  const state = { isRunning: true };
  void run.finally(() => {
    state.isRunning = false;
  });
  while (state.isRunning || queue.length > 0) {
    const head = queue.peekTimestamp();
    const pair = head === undefined ? undefined : queue.takePairAt(head);
    if (pair) taken.push(pair);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  return taken;
}

/**
 * The real port, watched: after every packet it records the most packets a decoder held.
 */
class PendingObservingPort implements VideoDecoderPort<VideoFrame> {
  public mostPending = 0;

  public constructor(private readonly inner: VideoDecoderPort<VideoFrame>) {}

  public isSupported(configuration: VideoDecoderConfiguration): Promise<boolean> {
    return this.inner.isSupported(configuration);
  }

  public async create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<VideoFrame>,
  ): Promise<VideoDecoderHandle> {
    const handle = await this.inner.create(configuration, callbacks);
    const decode = handle.decode.bind(handle);
    return Object.assign(handle, {
      decode: (packet: EncodedVideoPacket): void => {
        decode(packet);
        this.mostPending = Math.max(this.mostPending, handle.pendingCount);
      },
    });
  }
}

describe('WebCodecsVideoDecoderPort', () => {
  let input: DemuxedInput;
  let configuration: VideoDecoderConfiguration;

  beforeAll(async () => {
    const response = await fetch(fixtureUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    input = await new MediabunnyDemuxer().open(new InMemoryRandomAccessSource(bytes), 'synthetic');
    configuration = await input.videoTracks[0]!.decoderConfiguration();
  });

  afterAll(() => {
    input.dispose();
  });

  it('reports support for the fixture codec and none for nonsense', async () => {
    await expect(port.isSupported(configuration)).resolves.toBe(true);
    await expect(
      port.isSupported({ ...configuration, codec: 'nonsense.1', description: undefined }),
    ).resolves.toBe(false);
  });

  it('decodes both lens tracks through the pipeline into paired VideoFrames', async () => {
    const pipeline = new LensDecodePipeline(input.videoTracks, port, PIPELINE_OPTIONS);
    const queue = new FramePairQueue<VideoFrame>(4);
    const run = pipeline.run(seconds(0), queue);
    const pairs = await drain(queue, run);
    const report = await run;

    expect(report).toMatchObject({
      pairsDelivered: FRAMES,
      unpairedFrames: 0,
      hasReachedEnd: true,
    });
    expect(pairs).toHaveLength(FRAMES);
    expect(pairs[0]?.frames.map((frame) => frame.handle.codedWidth)).toEqual([64, 64]);
    expect(pairs.map((pair) => pair.timestamp)).toEqual(
      Array.from({ length: FRAMES }, (_unused, frame) => expect.closeTo(frame / 10, 5) as number),
    );
    for (const pair of pairs) for (const frame of pair.frames) frame.close();
  });

  it('decodes from the preceding key frame, so a run from mid-GOP shows the frame due then', async () => {
    const pipeline = new LensDecodePipeline(input.videoTracks, port, PIPELINE_OPTIONS);
    const queue = new FramePairQueue<VideoFrame>(4);
    const run = pipeline.run(seconds(1.25), queue);
    const pairs = await drain(queue, run);
    await run;

    expect(pairs[0]?.timestamp).toBeCloseTo(1.2, 5);
    for (const pair of pairs) for (const frame of pair.frames) frame.close();
  });

  it('never holds more packets in a decoder than the pipeline allows', async () => {
    const observed = new PendingObservingPort(port);
    const pipeline = new LensDecodePipeline(input.videoTracks, observed, {
      ...PIPELINE_OPTIONS,
      maxPendingPackets: 2,
    });
    const queue = new FramePairQueue<VideoFrame>(2);
    const run = pipeline.run(seconds(0), queue);
    const pairs = await drain(queue, run);
    await run;
    expect(pairs).toHaveLength(FRAMES);
    expect(observed.mostPending).toBeGreaterThan(0);
    expect(observed.mostPending).toBeLessThanOrEqual(2);
    for (const pair of pairs) for (const frame of pair.frames) frame.close();
  });
});
