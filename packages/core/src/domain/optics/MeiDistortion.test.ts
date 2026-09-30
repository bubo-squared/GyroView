import { describe, expect, it } from 'vitest';

import { distortMei, type MeiDistortion, type NormalisedPoint } from './MeiDistortion';

const NONE: MeiDistortion = { radial: [], tangential: [], thinPrism: [] };
const POINT: NormalisedPoint = [0.3, -0.2];
const X = 0.3;
const Y = -0.2;
const R2 = X * X + Y * Y;
const PRECISION = 12;

function expectPoint(actual: NormalisedPoint, expected: NormalisedPoint): void {
  expect(actual[0]).toBeCloseTo(expected[0], PRECISION);
  expect(actual[1]).toBeCloseTo(expected[1], PRECISION);
}

describe('distortMei', () => {
  it('leaves the point where it is without terms', () => {
    expectPoint(distortMei(NONE, POINT), POINT);
  });

  it('scales the point radially by 1 + k1 r² + k2 r⁴ + ... up to five terms', () => {
    const radial = [0.2, -0.1, 0.05, 0.4, -0.3];
    const factor = 1 + radial.reduce((sum, k, index) => sum + k * R2 ** (index + 1), 0);
    expectPoint(distortMei({ ...NONE, radial }, POINT), [X * factor, Y * factor]);
  });

  it("applies Brown's decentering pair as the first tangential order", () => {
    const [p1, p2] = [0.01, -0.02];
    expectPoint(distortMei({ ...NONE, tangential: [{ p1, p2 }] }, POINT), [
      X + 2 * p1 * X * Y + p2 * (R2 + 2 * X * X),
      Y + p1 * (R2 + 2 * Y * Y) + 2 * p2 * X * Y,
    ]);
  });

  it('scales the second tangential order by r²', () => {
    const [p1, p2] = [0.03, 0.04];
    const tangential = [
      { p1: 0, p2: 0 },
      { p1, p2 },
    ];
    expectPoint(distortMei({ ...NONE, tangential }, POINT), [
      X + R2 * (2 * p1 * X * Y + p2 * (R2 + 2 * X * X)),
      Y + R2 * (p1 * (R2 + 2 * Y * Y) + 2 * p2 * X * Y),
    ]);
  });

  it('shifts the point by each thin-prism order scaled by r² and r⁴', () => {
    const thinPrism = [
      { x: 0.02, y: -0.01 },
      { x: 0.005, y: 0.03 },
    ];
    expectPoint(distortMei({ ...NONE, thinPrism }, POINT), [
      X + 0.02 * R2 + 0.005 * R2 * R2,
      Y - 0.01 * R2 + 0.03 * R2 * R2,
    ]);
  });

  it('adds the families together', () => {
    const radial = [0.2];
    const tangential = [{ p1: 0.01, p2: -0.02 }];
    const thinPrism = [{ x: 0.02, y: -0.01 }];
    const [radialX, radialY] = distortMei({ ...NONE, radial }, POINT);
    const [tangentialX, tangentialY] = distortMei({ ...NONE, tangential }, POINT);
    const [prismX, prismY] = distortMei({ ...NONE, thinPrism }, POINT);
    expectPoint(distortMei({ radial, tangential, thinPrism }, POINT), [
      radialX + tangentialX + prismX - 2 * X,
      radialY + tangentialY + prismY - 2 * Y,
    ]);
  });
});
