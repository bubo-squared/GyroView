import { seconds, type DecodedFrame } from '@gyroview/core';

import { RGBA_CHANNELS } from '../seamMeter/rowMeans';

/**
 * Decoded frames painted on a 2D canvas, for tests of what the renderer makes of them.
 */
export const DEFAULT_FRAME_SIZE = 64;
export const GRADIENT_SIZE = 256;
const CHANNEL_MAX = 255;

export type Painter = (context: CanvasRenderingContext2D, size: number) => void;

export function frameOf(paint: Painter, size = DEFAULT_FRAME_SIZE): DecodedFrame<VideoFrame> {
  const source = document.createElement('canvas');
  source.width = size;
  source.height = size;
  const context = source.getContext('2d');
  if (!context) throw new Error('no 2d context');
  paint(context, size);
  const frame = new VideoFrame(source, { timestamp: 0 });
  return {
    timestamp: seconds(0),
    handle: frame,
    close: (): void => {
      frame.close();
    },
  };
}

/**
 * A black frame `width` pixels wide and two high, built from bytes: a canvas that wide may be
 * refused before the renderer sees it.
 */
export function stripFrame(width: number): DecodedFrame<VideoFrame> {
  const height = 2;
  const frame = new VideoFrame(new Uint8Array(width * height * RGBA_CHANNELS), {
    format: 'RGBA',
    codedWidth: width,
    codedHeight: height,
    timestamp: 0,
  });
  return {
    timestamp: seconds(0),
    handle: frame,
    close: (): void => {
      frame.close();
    },
  };
}

export function solidFrame(fillStyle: string): DecodedFrame<VideoFrame> {
  return frameOf((context, size) => {
    context.fillStyle = fillStyle;
    context.fillRect(0, 0, size, size);
  });
}

export function halvesFrame(left: string, right: string): DecodedFrame<VideoFrame> {
  return frameOf((context, size) => {
    context.fillStyle = left;
    context.fillRect(0, 0, size / 2, size);
    context.fillStyle = right;
    context.fillRect(size / 2, 0, size / 2, size);
  });
}

/**
 * A grey frame whose level at each pixel is `lumaAt(column, row)` in 0..1.
 */
export function paintedFrame(
  size: number,
  lumaAt: (column: number, row: number) => number,
): DecodedFrame<VideoFrame> {
  return frameOf((context) => {
    const image = context.createImageData(size, size);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const offset = (row * size + column) * RGBA_CHANNELS;
        const level = Math.round(CHANNEL_MAX * lumaAt(column, row));
        image.data[offset] = level;
        image.data[offset + 1] = level;
        image.data[offset + 2] = level;
        image.data[offset + 3] = CHANNEL_MAX;
      }
    }
    context.putImageData(image, 0, 0);
  }, size);
}

/**
 * Black and white columns one pixel wide: the finest texture a frame can hold, which minified
 * must average to grey and read one tap at a time lands anywhere between.
 */
export function stripesFrame(): DecodedFrame<VideoFrame> {
  return paintedFrame(GRADIENT_SIZE, (column) => column % 2);
}

/**
 * Red encodes the frame's x, green its y, so a sampled colour tells which frame pixel was read.
 */
export function gradientFrame(): DecodedFrame<VideoFrame> {
  return frameOf((context, size) => {
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * RGBA_CHANNELS;
        image.data[offset] = x;
        image.data[offset + 1] = y;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = CHANNEL_MAX;
      }
    }
    context.putImageData(image, 0, 0);
  }, GRADIENT_SIZE);
}
