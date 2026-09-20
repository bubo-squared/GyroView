import { describe, expect, it } from 'vitest';

import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('shows minutes and seconds below an hour', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('adds hours from one hour on', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('reads unknown and negative times as zero', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
  });
});
