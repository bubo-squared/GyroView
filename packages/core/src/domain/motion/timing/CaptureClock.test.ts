import { describe, expect, it } from 'vitest';

import { CaptureClock } from './CaptureClock';
import { microseconds, milliseconds, seconds } from '../../../shared/units/time';

const clock = new CaptureClock(microseconds(921_751_839), milliseconds(1.6));

describe('CaptureClock', () => {
  it('maps the first frame to video time zero and later capture times to seconds', () => {
    expect(clock.videoTimeOf(microseconds(921_751_839))).toBe(0);
    expect(clock.videoTimeOf(microseconds(921_751_839 + 2_500_000))).toBe(2.5);
  });

  it('shifts gyro capture times by the gyro offset', () => {
    expect(clock.gyroVideoTimeOf(microseconds(921_751_839 + 1_000_000))).toBeCloseTo(0.9984, 9);
  });

  it('converts video time back to whole-microsecond capture times', () => {
    expect(clock.captureTimeOf(seconds(1.5))).toBe(921_751_839 + 1_500_000);
    expect(clock.captureTimeOf(seconds(0.0000004))).toBe(921_751_839);
  });

  it('defaults to no gyro offset', () => {
    expect(new CaptureClock(microseconds(1000)).gyroVideoTimeOf(microseconds(2000))).toBe(0.001);
  });
});
