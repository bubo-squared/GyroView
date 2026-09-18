import { describe, expect, it } from 'vitest';

import { degrees, degreesToRadians, radians, radiansToDegrees } from './angle';

describe('angle units', () => {
  it('converts degrees to radians and back', () => {
    expect(degreesToRadians(degrees(180))).toBeCloseTo(Math.PI, 12);
    expect(radiansToDegrees(radians(Math.PI / 2))).toBeCloseTo(90, 12);
  });
});
