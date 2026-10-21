import { describe, expect, it } from 'vitest';

import { openRendition } from './rendition';
import { fetchBytes, X5_RECORDING_URL } from './test/recordings';

/**
 * The synthetic X5 recording: 10 fps for 3 s.
 */
const FRAME_COUNT = 30;
const WIDTH = 64;

async function countFrames(frames: AsyncIterable<VideoFrame>): Promise<number> {
  let count = 0;
  for await (const frame of frames) {
    frame.close();
    count += 1;
  }
  return count;
}

function isRefusal(answer: unknown, code: string): boolean {
  return typeof answer === 'object' && answer !== null && 'code' in answer && answer.code === code;
}

describe('openRendition', () => {
  it('renders a recording named by URL, and tells what it is', async () => {
    const rendition = await openRendition({ main: { url: X5_RECORDING_URL } }, { width: WIDTH });
    expect(rendition.metadata.model).toBe('Insta360 X5');
    expect({ width: rendition.width, height: rendition.height }).toEqual({ width: 64, height: 32 });
    expect(rendition.duration).toBeCloseTo(3, 5);
    expect(await countFrames(rendition.frames())).toBe(FRAME_COUNT);
  });

  it('renders a recording from a File and trims it to the span asked for', async () => {
    const file = new File([await fetchBytes(X5_RECORDING_URL)], 'VID_20260814_132640_00_013.insv');
    const rendition = await openRendition(
      { main: { blob: file, name: file.name } },
      { width: WIDTH, from: 1, to: 2 },
    );
    expect(rendition.duration).toBeCloseTo(1, 5);
    expect(await countFrames(rendition.frames())).toBe(10);
  });

  it('refuses a width whose picture encoders cannot take, and lets the recording go', async () => {
    await expect(
      openRendition({ main: { url: X5_RECORDING_URL } }, { width: 63 }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects with the reason its signal is aborted for, rather than ending as if finished', async () => {
    const controller = new AbortController();
    const rendition = await openRendition(
      { main: { url: X5_RECORDING_URL } },
      { width: WIDTH, signal: controller.signal },
    );
    const frames = rendition.frames()[Symbol.asyncIterator]();
    const first = await frames.next();
    if (!first.done) first.value.close();
    const reason = new Error('the encoder was cancelled');
    controller.abort(reason);
    await expect(frames.next()).rejects.toBe(reason);
  });

  it('renders in a dedicated worker, drawing on an OffscreenCanvas of its own', async (context) => {
    const worker = new Worker(new URL('test/renditionWorker.ts', import.meta.url), {
      type: 'module',
    });
    try {
      const answer = await new Promise<unknown>((resolve) => {
        worker.addEventListener('message', (event) => {
          resolve(event.data);
        });
        worker.postMessage({ url: new URL(X5_RECORDING_URL, location.href).href, width: WIDTH });
      });
      // WebKit on Linux gives a worker's OffscreenCanvas no WebGL2 context.
      if (isRefusal(answer, 'render-unavailable')) context.skip('no WebGL2 in a worker here');
      expect(answer).toEqual({ count: FRAME_COUNT, size: { width: 64, height: 32 } });
    } finally {
      worker.terminate();
    }
  });
});
