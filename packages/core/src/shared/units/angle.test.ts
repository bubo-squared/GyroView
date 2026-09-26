import { describe, expect, it } from 'vitest';

import { degrees, degreesToRadians, radians, radiansToDegrees, wrapHalfTurn } from './angle';

describe('angle units', () => {
  it('converts degrees to radians and back', () => {
    expect(degreesToRadians(degrees(180))).toBeCloseTo(Math.PI, 12);
    expect(radiansToDegrees(radians(Math.PI / 2))).toBeCloseTo(90, 12);
  });

  it('wraps an angle into a half turn either way, 180 included and -180 not', () => {
    expect(wrapHalfTurn(degrees(190))).toBe(-170);
    expect(wrapHalfTurn(degrees(-190))).toBe(170);
    expect(wrapHalfTurn(degrees(180))).toBe(180);
    expect(wrapHalfTurn(degrees(-180))).toBe(180);
    expect(wrapHalfTurn(degrees(720 + 45))).toBe(45);
  });
});
