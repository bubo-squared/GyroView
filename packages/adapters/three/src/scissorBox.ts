import type { ScreenRectangle, ViewportSize } from '@gyroview/core';
import { Vector4 } from 'three';

/**
 * Pixels the box reaches past the area on each side, so that rounding never cuts a pixel the
 * area holds; the shader decides those.
 */
const MARGIN_PIXELS = 1;

/**
 * The box of the drawing buffer a pass is drawn within, in device pixels from the bottom-left
 * corner as three's scissor takes it, around an area of the viewport given from the top-left.
 */
export function scissorBoxOf(area: ScreenRectangle, buffer: ViewportSize): Vector4 {
  const left = Math.max(Math.floor(area.x * buffer.width) - MARGIN_PIXELS, 0);
  const right = Math.min(
    Math.ceil((area.x + area.width) * buffer.width) + MARGIN_PIXELS,
    buffer.width,
  );
  const top = Math.max(Math.floor(area.y * buffer.height) - MARGIN_PIXELS, 0);
  const bottom = Math.min(
    Math.ceil((area.y + area.height) * buffer.height) + MARGIN_PIXELS,
    buffer.height,
  );
  return new Vector4(left, buffer.height - bottom, right - left, bottom - top);
}
