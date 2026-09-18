import { describe, expect, it } from 'vitest';

import {
  microseconds,
  microsecondsToSeconds,
  milliseconds,
  millisecondsToMicroseconds,
  millisecondsToSeconds,
  seconds,
  secondsToMicroseconds,
} from './time';

describe('time units', () => {
  it('converts between microseconds, milliseconds and seconds', () => {
    expect(microsecondsToSeconds(microseconds(1_500_000))).toBe(1.5);
    expect(millisecondsToMicroseconds(milliseconds(1.6))).toBe(1600);
    expect(millisecondsToSeconds(milliseconds(250))).toBe(0.25);
    expect(secondsToMicroseconds(seconds(2))).toBe(2_000_000);
  });
});
