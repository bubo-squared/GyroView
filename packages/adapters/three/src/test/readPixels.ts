import { ensureInvariant } from '@gyroview/core';

import { RGBA_CHANNELS } from '../seamMeter/rowMeans';

/**
 * The canvas's drawing buffer as RGBA rows from the bottom up, read through the WebGL 2 context
 * the renderer drew with; the renderer must have been created to preserve it.
 */
export function readPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const gl = canvas.getContext('webgl2');
  ensureInvariant(gl !== null, 'the canvas holds no WebGL 2 context');
  const pixels = new Uint8ClampedArray(canvas.width * canvas.height * RGBA_CHANNELS);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}
