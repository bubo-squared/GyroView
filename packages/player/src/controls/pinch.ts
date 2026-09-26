/**
 * A pointer's position on the viewport, in CSS pixels.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
