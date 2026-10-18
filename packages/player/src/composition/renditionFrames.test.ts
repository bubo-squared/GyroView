import {
  seconds,
  type VideoDecoderConfiguration,
  type VideoDecoderCallbacks,
  type VideoDecoderHandle,
  type VideoDecoderPort,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { browserPorts } from './browserPorts';
import { openRecording } from './openRecording';
import type { OpenedRecording } from './OpenedRecording';
import { renditionOf, type RenditionRequest } from './renditionFrames';
import { X5_RECORDING_URL } from '../test/recordings';

/**
 * The synthetic X5 recording: 10 fps for 3 s, two 64-pixel lens tracks.
 */
const FRAME_COUNT = 30;
const FRAME_MICROSECONDS = 100_000;
const WIDTH = 64;

/**
 * A decoder port that counts the decoders it made and how many are still open.
 */
class CountingDecoderPort implements VideoDecoderPort<VideoFrame> {
  public created = 0;
  public open = 0;

  public constructor(private readonly port: VideoDecoderPort<VideoFrame>) {}

  public isSupported(configuration: VideoDecoderConfiguration): Promise<boolean> {
    return this.port.isSupported(configuration);
  }

  public async create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<VideoFrame>,
  ): Promise<VideoDecoderHandle> {
    const handle = await this.port.create(configuration, callbacks);
    this.created += 1;
    this.open += 1;
    let isOpen = true;
    const close = (): void => {
      if (isOpen) this.open -= 1;
      isOpen = false;
      handle.close();
    };
    return {
      get pendingCount(): number {
        return handle.pendingCount;
      },
      decode: (packet): void => {
        handle.decode(packet);
      },
      waitForPendingBelow: (limit) => handle.waitForPendingBelow(limit),
      flush: () => handle.flush(),
      close,
    };
  }
}

/**
 * A frame's pixels as RGBA, read through a 2D canvas.
 */
function pixelsOf(frame: VideoFrame): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2D context');
  context.drawImage(frame, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

describe('renditionOf', () => {
  const opened: OpenedRecording[] = [];

  afterEach(() => {
    for (const recording of opened.splice(0)) recording.dispose();
  });

  async function openSynthetic(): Promise<{
    recording: OpenedRecording;
    decoders: CountingDecoderPort;
  }> {
    const ports = browserPorts();
    const recording = await openRecording(
      { main: { url: X5_RECORDING_URL }, second: undefined },
      ports,
      new AbortController().signal,
    );
    opened.push(recording);
    return { recording, decoders: new CountingDecoderPort(ports.decoderPort) };
  }

  /**
   * Every frame the rendition yields, its timestamp, duration and size kept, the frame closed.
   */
  async function framesOf(
    recording: OpenedRecording,
    request: RenditionRequest,
    decoders?: VideoDecoderPort<VideoFrame>,
  ): Promise<{ timestamp: number; duration: number | null; width: number; height: number }[]> {
    const ports = browserPorts();
    const rendition = renditionOf(
      { opened: recording, decoderPort: decoders ?? ports.decoderPort },
      request,
    );
    const seen = [];
    for await (const frame of rendition.frames()) {
      seen.push({
        timestamp: frame.timestamp,
        duration: frame.duration,
        width: frame.displayWidth,
        height: frame.displayHeight,
      });
      frame.close();
    }
    return seen;
  }

  it('renders every frame of the recording once, in order, as 2:1 panoramas timed from its start', async () => {
    const { recording } = await openSynthetic();
    const frames = await framesOf(recording, { width: WIDTH });
    expect(frames).toHaveLength(FRAME_COUNT);
    expect(frames.map((frame) => frame.timestamp)).toEqual(
      Array.from({ length: FRAME_COUNT }, (_unused, index) => index * FRAME_MICROSECONDS),
    );
    expect(frames[0]).toMatchObject({
      width: WIDTH,
      height: WIDTH / 2,
      duration: FRAME_MICROSECONDS,
    });
  });

  it('draws the stitched panorama, the same pixels every time whatever the pace of the GPU', async () => {
    const { recording } = await openSynthetic();
    const renders: Uint8ClampedArray[][] = [];
    for (let run = 0; run < 2; run += 1) {
      const rendition = renditionOf(
        { opened: recording, decoderPort: browserPorts().decoderPort },
        { width: WIDTH },
      );
      const pictures: Uint8ClampedArray[] = [];
      for await (const frame of rendition.frames()) {
        pictures.push(pixelsOf(frame));
        frame.close();
      }
      renders.push(pictures);
    }
    const [first, second] = renders;
    expect(second).toEqual(first);
    const middle = first?.[FRAME_COUNT / 2] ?? new Uint8ClampedArray();
    expect(new Set(middle).size).toBeGreaterThan(16);
  });

  it('renders only the frames of the span asked for, timed from its start', async () => {
    const { recording } = await openSynthetic();
    const frames = await framesOf(recording, { width: WIDTH, from: seconds(1.05), to: seconds(2) });
    expect(frames.map((frame) => frame.timestamp)).toEqual(
      Array.from({ length: 9 }, (_unused, index) => (index + 1) * FRAME_MICROSECONDS - 50_000),
    );
  });

  it('loses no frame to a consumer that takes its time', async () => {
    const { recording } = await openSynthetic();
    const rendition = renditionOf(
      { opened: recording, decoderPort: browserPorts().decoderPort },
      { width: WIDTH },
    );
    let count = 0;
    for await (const frame of rendition.frames()) {
      frame.close();
      count += 1;
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    expect(count).toBe(FRAME_COUNT);
  });

  it('lets go of its decoders when the consumer stops part way, and when it reaches the end', async () => {
    const { recording, decoders } = await openSynthetic();
    const rendition = renditionOf({ opened: recording, decoderPort: decoders }, { width: WIDTH });
    let count = 0;
    for await (const frame of rendition.frames()) {
      frame.close();
      count += 1;
      if (count === 5) break;
    }
    expect(decoders.created).toBeGreaterThan(0);
    expect(decoders.open).toBe(0);

    await framesOf(recording, { width: WIDTH }, decoders);
    expect(decoders.open).toBe(0);
  });

  it('stops at once when disposed while the consumer waits, yielding nothing more', async () => {
    const { recording } = await openSynthetic();
    const rendition = renditionOf(
      { opened: recording, decoderPort: browserPorts().decoderPort },
      { width: WIDTH },
    );
    const frames = rendition.frames();
    const first = await frames.next();
    if (!first.done) first.value.close();
    rendition.dispose();
    expect(await frames.next()).toEqual({ done: true, value: undefined });
  });

  it('refuses a size or span that holds no picture before it decodes anything', async () => {
    const { recording, decoders } = await openSynthetic();
    for (const request of [{ width: 66 }, { width: WIDTH, from: seconds(3) }]) {
      expect(() => renditionOf({ opened: recording, decoderPort: decoders }, request)).toThrow(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    }
    expect(decoders.created).toBe(0);
  });

  it('renders a recording without a gyro as recorded, every frame still there', async () => {
    const { recording } = await openSynthetic();
    const frames = await framesOf({ ...recording, motion: undefined }, { width: WIDTH });
    expect(frames).toHaveLength(FRAME_COUNT);
  });
});
