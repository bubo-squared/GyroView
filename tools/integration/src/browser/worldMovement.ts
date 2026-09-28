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
 * Mean absolute colour difference between two renders.
 */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let total = 0;
  for (let offset = 0; offset < a.length; offset += RGBA) {
    for (let channel = 0; channel < RGBA - 1; channel += 1) {
      total += Math.abs((a[offset + channel] ?? 0) - (b[offset + channel] ?? 0));
    }
  }
  return total / ((a.length / RGBA) * (RGBA - 1));
}

/**
 * How much the world moves between the two pairs when each is turned by `rotationFor` its time:
 * under lock with the camera's true orientation it stands nearly still.
 */
export function worldMovement(
  renderable: Renderable,
  rotationFor: (pair: FramePair<VideoFrame>) => Matrix3,
): number {
  const { canvas, renderer, first, later } = renderable;
  renderer.setStabilization(rotationFor(first));
  renderer.present({ pair: first, mediaTime: first.timestamp });
  const before = readPixels(canvas);
  renderer.setStabilization(rotationFor(later));
  renderer.present({ pair: later, mediaTime: later.timestamp });
  return difference(before, readPixels(canvas));
}
