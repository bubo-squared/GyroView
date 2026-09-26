import { describe, expect, it } from 'vitest';

import { degrees, degreesToRadians } from './angle';

describe('angle units', () => {
  it('converts degrees to radians', () => {
    expect(degreesToRadians(degrees(180))).toBeCloseTo(Math.PI, 12);
  });
});
