import { seconds, type DecodedFrame } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { readPixels } from './test/readPixels';
import { halvesFrame, solidFrame } from './test/syntheticFrames';
import { MULTI_TRACK, setupAsRecorded } from './test/syntheticStitching';
import { ThreeFrameRenderer } from './ThreeFrameRenderer';

const SIZE = { width: 64, height: 32 };

describe('ThreeFrameRenderer on an OffscreenCanvas', () => {
  const renderers: ThreeFrameRenderer[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  function panoramaOn(canvas: HTMLCanvasElement | OffscreenCanvas): Uint8ClampedArray {
    canvas.width = SIZE.width;
    canvas.height = SIZE.height;
    const renderer = ThreeFrameRenderer.create(canvas, setupAsRecorded(MULTI_TRACK), {
      preserveDrawingBuffer: true,
    });
    renderers.push(renderer);
    renderer.setViewMode('equirectangular');
    const pair = [halvesFrame('#ff0000', '#00ff00'), solidFrame('#0000ff')];
    frames.push(...pair);
    renderer.present({ pair: { timestamp: seconds(0), frames: pair }, mediaTime: seconds(0) });
    return readPixels(canvas);
  }

  afterEach(() => {
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
  });

  it('draws the same panorama on an OffscreenCanvas as on a canvas element', () => {
    const onElement = panoramaOn(document.createElement('canvas'));
    const offscreen = panoramaOn(new OffscreenCanvas(SIZE.width, SIZE.height));
    expect(offscreen).toEqual(onElement);
    expect(offscreen.some((channel) => channel > 0)).toBe(true);
  });

  it('can be captured as a VideoFrame straight after a presentation', () => {
    const canvas = new OffscreenCanvas(SIZE.width, SIZE.height);
    const pixels = panoramaOn(canvas);
    const frame = new VideoFrame(canvas, { timestamp: 0 });
    try {
      expect({ width: frame.displayWidth, height: frame.displayHeight }).toEqual(SIZE);
      expect(pixels.some((channel) => channel > 0)).toBe(true);
    } finally {
      frame.close();
    }
  });
});
