import type { Brand } from './Brand';

export type Degrees = Brand<number, 'Degrees'>;
export type Radians = Brand<number, 'Radians'>;

export const degrees = (value: number): Degrees => value as Degrees;
export const radians = (value: number): Radians => value as Radians;

const DEGREES_PER_HALF_TURN = 180;
const HALF_TURNS_PER_TURN = 2;

export const HALF_TURN = degrees(DEGREES_PER_HALF_TURN);
export const FULL_TURN = degrees(DEGREES_PER_HALF_TURN * HALF_TURNS_PER_TURN);

export const degreesToRadians = (value: Degrees): Radians =>
  radians((value * Math.PI) / DEGREES_PER_HALF_TURN);

export const radiansToDegrees = (value: Radians): Degrees =>
  degrees((value * DEGREES_PER_HALF_TURN) / Math.PI);

/**
 * The same direction as an angle in (-180, 180] degrees.
 */
export function wrapHalfTurn(angle: Degrees): Degrees {
  let wrapped: number = angle % FULL_TURN;
  if (wrapped > HALF_TURN) wrapped -= FULL_TURN;
  if (wrapped <= 0 - HALF_TURN) wrapped += FULL_TURN;
  return degrees(wrapped);
}
