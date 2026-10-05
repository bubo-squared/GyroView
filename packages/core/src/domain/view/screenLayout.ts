import { ensureInvariant } from '../../shared/errors/GyroViewError';
import { clamp } from '../../shared/math/clamp';
import type { Rectangle, Size } from '../../shared/math/Rectangle';

/**
 * A rectangle of the viewport as fractions of its width and height, from the top-left corner.
 */
export type ScreenRectangle = Rectangle<'viewport fractions'>;

/**
 * A point of the viewport or of a picture, as fractions of its width and height from the top-left
 * corner.
 */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The viewport's size, in whatever unit the drags on it are measured in (CSS pixels for gestures).
 */
export type ViewportSize = Size<'viewport'>;

/**
 * A pointer movement on the viewport, in the unit of its size; positive x to the right, positive
 * y down.
 */
export interface DragDelta {
  readonly x: number;
  readonly y: number;
}

/**
 * A movement across the viewport as fractions of its width and height, positive to the right and
 * down; named apart from a drag's pixels so that one cannot pass for the other.
 */
export interface ScreenShift {
  readonly across: number;
  readonly down: number;
}

/**
 * Half of a length along one axis, as a fraction of it: the middle of the viewport or of a
 * picture.
 */
export const HALF = 0.5;

export const WHOLE_SCREEN: ScreenRectangle = { x: 0, y: 0, width: 1, height: 1 };
export const SCREEN_CENTRE: ScreenPoint = { x: HALF, y: HALF };

/**
 * An empty viewport counts as one unit wide and high, so no measure of it divides by zero.
 */
function measured(length: number): number {
  return Math.max(length, 1);
}

/**
 * Width over height.
 */
export function aspectOf(viewport: ViewportSize): number {
  return viewport.width / measured(viewport.height);
}

/**
 * A drag as fractions of the viewport it happened on.
 */
export function shiftOf(delta: DragDelta, viewport: ViewportSize): ScreenShift {
  return { across: delta.x / measured(viewport.width), down: delta.y / measured(viewport.height) };
}

/**
 * The point of a picture shown at a point of the viewport, as fractions of the picture.
 */
export function pictureAt(area: ScreenRectangle, point: ScreenPoint): ScreenPoint {
  return { x: (point.x - area.x) / area.width, y: (point.y - area.y) / area.height };
}

/**
 * One square tile per lens, in a row or in a column, whichever gives the larger tiles on this
 * viewport, centred with bars around. Square because every lens layout the player accepts has
 * square lens images: square tracks, or the halves of a 2:1 packed frame.
 */
export function lensTiles(lensCount: number, viewportAspect: number): ScreenRectangle[] {
  const row = fittedRectangle(lensCount, viewportAspect);
  const column = fittedRectangle(1 / lensCount, viewportAspect);
  const rowTileHeight = row.height;
  const columnTileHeight = column.height / lensCount;
  return rowTileHeight >= columnTileHeight
    ? tilesAcross(row, lensCount)
    : tilesDown(column, lensCount);
}

function tilesAcross(area: ScreenRectangle, count: number): ScreenRectangle[] {
  const width = area.width / count;
  return Array.from({ length: count }, (_unused, index) => ({
    ...area,
    x: area.x + index * width,
    width,
  }));
}

function tilesDown(area: ScreenRectangle, count: number): ScreenRectangle[] {
  const height = area.height / count;
  return Array.from({ length: count }, (_unused, index) => ({
    ...area,
    y: area.y + index * height,
    height,
  }));
}

/**
 * The smallest rectangle holding every one of the given rectangles.
 */
export function boundsOf(rectangles: readonly ScreenRectangle[]): ScreenRectangle {
  ensureInvariant(rectangles.length > 0, 'bounds need at least one rectangle');
  const left = Math.min(...rectangles.map((rectangle) => rectangle.x));
  const top = Math.min(...rectangles.map((rectangle) => rectangle.y));
  const right = Math.max(...rectangles.map((rectangle) => rectangle.x + rectangle.width));
  const bottom = Math.max(...rectangles.map((rectangle) => rectangle.y + rectangle.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The part of a rectangle inside the viewport; none, at its nearest edge, for one wholly outside.
 */
export function clippedToScreen(rectangle: ScreenRectangle): ScreenRectangle {
  const left = clamp(rectangle.x, 0, 1);
  const top = clamp(rectangle.y, 0, 1);
  const right = clamp(rectangle.x + rectangle.width, left, 1);
  const bottom = clamp(rectangle.y + rectangle.height, top, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The largest centred rectangle of the content's shape inside the viewport. Both aspects are
 * width over height; the bars it leaves go above and below wider content, beside narrower.
 */
export function fittedRectangle(contentAspect: number, viewportAspect: number): ScreenRectangle {
  if (contentAspect >= viewportAspect) {
    const height = viewportAspect / contentAspect;
    return { x: 0, y: (1 - height) * HALF, width: 1, height };
  }
  const width = contentAspect / viewportAspect;
  return { x: (1 - width) * HALF, y: 0, width, height: 1 };
}
