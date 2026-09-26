import { ensureInvariant } from '../../shared/errors/GyroViewError';

/**
 * A rectangle of the viewport as fractions of its width and height, from the top-left corner.
 */
export interface ScreenRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Width over height; an empty viewport counts as one unit high.
 */
export function aspectOf(viewport: ViewportSize): number {
  return viewport.width / Math.max(viewport.height, 1);
}

export const WHOLE_SCREEN: ScreenRectangle = { x: 0, y: 0, width: 1, height: 1 };
export const SCREEN_CENTRE: ScreenPoint = { x: 0.5, y: 0.5 };

const CENTRE = 0.5;

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
 * The largest centred rectangle of the content's shape inside the viewport. Both aspects are
 * width over height; the bars it leaves go above and below wider content, beside narrower.
 */
export function fittedRectangle(contentAspect: number, viewportAspect: number): ScreenRectangle {
  if (contentAspect >= viewportAspect) {
    const height = viewportAspect / contentAspect;
    return { x: 0, y: (1 - height) * CENTRE, width: 1, height };
  }
  const width = contentAspect / viewportAspect;
  return { x: (1 - width) * CENTRE, y: 0, width, height: 1 };
}
