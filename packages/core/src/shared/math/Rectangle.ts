declare const space: unique symbol;

/**
 * An axis-aligned rectangle from its top-left corner, in the units of `Space`: fractions of the
 * viewport, fractions of a decoded frame, pixels of the calibration canvas. The space is part of
 * the type, as a unit brand is part of a number's: a frame region cannot be handed where a
 * canvas window is expected, while a plain `{ x, y, width, height }` still makes either.
 */
export interface Rectangle<Space extends string> {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly [space]?: Space;
}

/**
 * A width and height in the units of `Space`, kept apart as {@link Rectangle}s are.
 */
export interface Size<Space extends string> {
  readonly width: number;
  readonly height: number;
  readonly [space]?: Space;
}
