import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import { readPixels } from '@gyroview/adapter-three/testing';
import type { FramePair, Matrix3 } from '@gyroview/core';

const RGBA = 4;

/**
 * Two pairs of one moment, and the renderer that draws them on the canvas.
 */
export interface Renderable {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: ThreeFrameRenderer;
  readonly first: FramePair<VideoFrame>;
  readonly later: FramePair<VideoFrame>;
}

/**
 * The rows of a render compared, as fractions of its height from the top: the whole render, or a
 * band of it.
 */
export interface RowBand {
  readonly top: number;
  readonly bottom: number;
}

const WHOLE_RENDER: RowBand = { top: 0, bottom: 1 };

/**
 * Mean absolute colour difference between two renders, over a band of their rows.
 */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray, rows: RowRange): number {
  let total = 0;
  for (let offset = rows.start; offset < rows.end; offset += RGBA) {
    for (let channel = 0; channel < RGBA - 1; channel += 1) {
      total += Math.abs((a[offset + channel] ?? 0) - (b[offset + channel] ?? 0));
    }
  }
  return total / (((rows.end - rows.start) / RGBA) * (RGBA - 1));
}

interface RowRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Where a band's rows lie in a WebGL read-back, whose rows run from the bottom up.
 */
function rowRangeOf(band: RowBand, canvas: HTMLCanvasElement): RowRange {
  const rowBytes = canvas.width * RGBA;
  const fromBottom = (fraction: number): number => Math.round((1 - fraction) * canvas.height);
  return { start: fromBottom(band.bottom) * rowBytes, end: fromBottom(band.top) * rowBytes };
}

/**
 * How much the world moves between the two pairs when each is turned by `rotationFor` its time:
 * under lock with the camera's true orientation it stands nearly still.
 */
export function worldMovement(
  renderable: Renderable,
  rotationFor: (pair: FramePair<VideoFrame>) => Matrix3,
  band: RowBand = WHOLE_RENDER,
): number {
  const { canvas, renderer, first, later } = renderable;
  renderer.setStabilization(rotationFor(first));
  renderer.present({ pair: first, mediaTime: first.timestamp });
  const before = readPixels(canvas);
  renderer.setStabilization(rotationFor(later));
  renderer.present({ pair: later, mediaTime: later.timestamp });
  return difference(before, readPixels(canvas), rowRangeOf(band, canvas));
}
