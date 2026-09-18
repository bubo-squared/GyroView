import type { Brand } from './Brand';

export type Microseconds = Brand<number, 'Microseconds'>;
export type Milliseconds = Brand<number, 'Milliseconds'>;
export type Seconds = Brand<number, 'Seconds'>;

const MICROSECONDS_PER_SECOND = 1_000_000;
const MILLISECONDS_PER_SECOND = 1000;
const MICROSECONDS_PER_MILLISECOND = 1000;

export const microseconds = (value: number): Microseconds => value as Microseconds;
export const milliseconds = (value: number): Milliseconds => value as Milliseconds;
export const seconds = (value: number): Seconds => value as Seconds;

export const microsecondsToSeconds = (value: Microseconds): Seconds =>
  seconds(value / MICROSECONDS_PER_SECOND);
export const millisecondsToMicroseconds = (value: Milliseconds): Microseconds =>
  microseconds(value * MICROSECONDS_PER_MILLISECOND);
export const millisecondsToSeconds = (value: Milliseconds): Seconds =>
  seconds(value / MILLISECONDS_PER_SECOND);
export const secondsToMicroseconds = (value: Seconds): Microseconds =>
  microseconds(value * MICROSECONDS_PER_SECOND);
