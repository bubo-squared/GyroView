/**
 * A pointer's position on the viewport, in CSS pixels.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Matches the wheel's zoom step so a pinch that doubles the finger distance zooms as far as
 * about seven notches.
 */
const ZOOM_STEP = 1.1;

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * How many zoom steps a pinch from `previousDistance` to `distance` is worth: positive when
 * the fingers spread (zoom in). Zero when either distance is degenerate.
 */
export function zoomStepsForPinch(previousDistance: number, distance: number): number {
  return previousDistance <= 0 || distance <= 0
    ? 0
    : Math.log(distance / previousDistance) / Math.log(ZOOM_STEP);
}
