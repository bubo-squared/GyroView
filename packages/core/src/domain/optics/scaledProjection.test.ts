import { describe, expect, it } from 'vitest';

import type { LensProjectionParameters } from './LensModel';
import { scaledProjection } from './scaledProjection';

const MEI: LensProjectionParameters = {
  kind: 'mei',
  xi: 2,
  focal: [4000, 4010],
  principalPoint: { x: 2700, y: 2690 },
  distortion: { radial: [0.2], tangential: [{ p1: 0.001, p2: -0.002 }], thinPrism: [] },
};

const POLYNOMIAL: LensProjectionParameters = {
  kind: 'radial-polynomial',
  principalPoint: { x: 2700, y: 2690 },
  coefficients: [1500, -20, 3, -0.5],
};

describe('scaledProjection', () => {
  it('draws a Mei lens at the scale through its focal lengths alone', () => {
    expect(scaledProjection(MEI, 1.5)).toEqual({ ...MEI, focal: [6000, 6015] });
  });

  it('scales every coefficient of a radial polynomial', () => {
    expect(scaledProjection(POLYNOMIAL, 2)).toEqual({
      ...POLYNOMIAL,
      coefficients: [3000, -40, 6, -1],
    });
  });

  it('leaves a projection as it is at a scale of 1', () => {
    expect(scaledProjection(MEI, 1)).toEqual(MEI);
    expect(scaledProjection(POLYNOMIAL, 1)).toEqual(POLYNOMIAL);
  });
});
