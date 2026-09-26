import type { Brand } from './Brand';

export type Degrees = Brand<number, 'Degrees'>;
export type Radians = Brand<number, 'Radians'>;

const DEGREES_PER_HALF_TURN = 180;

export const degrees = (value: number): Degrees => value as Degrees;
export const radians = (value: number): Radians => value as Radians;

export const degreesToRadians = (value: Degrees): Radians =>
  radians((value * Math.PI) / DEGREES_PER_HALF_TURN);

export const radiansToDegrees = (value: Radians): Degrees =>
  degrees((value * DEGREES_PER_HALF_TURN) / Math.PI);
