import { describe, expect, it } from 'vitest';

import {
  correctedLensRotation,
  isZeroDelta,
  largestComponentOf,
  ZERO_POSE_DELTA,
  type PoseDelta,
} from './poseDelta';
import { IDENTITY_MATRIX3, transformVector } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';

const X: Vector3 = [1, 0, 0];
const Y: Vector3 = [0, 1, 0];
const Z: Vector3 = [0, 0, 1];
const QUARTER = degrees(90);
const SMALL: PoseDelta = { yaw: degrees(1.5), pitch: degrees(-1.2), roll: degrees(0.9) };
const ORDER_TOLERANCE = 1e-3;

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

function deltaOf(part: Partial<PoseDelta>): PoseDelta {
  return { ...ZERO_POSE_DELTA, ...part };
}

/**
 * Where a body direction goes under the delta alone.
 */
function turned(part: Partial<PoseDelta>, direction: Vector3): Vector3 {
  return transformVector(correctedLensRotation(IDENTITY_MATRIX3, deltaOf(part)), direction);
}

describe('correctedLensRotation', () => {
  it('leaves the factory rotation alone for a zero delta', () => {
    expect(correctedLensRotation(IDENTITY_MATRIX3, ZERO_POSE_DELTA)).toEqual(IDENTITY_MATRIX3);
    expect(isZeroDelta(ZERO_POSE_DELTA)).toBe(true);
    expect(isZeroDelta(SMALL)).toBe(false);
  });

  it('turns about each body axis as named: yaw about down, pitch about right, roll about ahead', () => {
    expectVector(turned({ yaw: QUARTER }, Z), X);
    expectVector(turned({ pitch: QUARTER }, Y), Z);
    expectVector(turned({ roll: QUARTER }, X), Y);
  });

  it('applies the turn before the factory rotation, in the body frame', () => {
    const factory = correctedLensRotation(IDENTITY_MATRIX3, deltaOf({ yaw: QUARTER }));
    const corrected = correctedLensRotation(factory, deltaOf({ pitch: QUARTER }));
    // Pitch first takes y to z; the factory yaw then takes z to x.
    expectVector(transformVector(corrected, Y), X);
  });

  it('is nearly the same whatever the order for the small turns the search deals in', () => {
    const one = correctedLensRotation(IDENTITY_MATRIX3, SMALL);
    const rolled = correctedLensRotation(IDENTITY_MATRIX3, deltaOf({ roll: SMALL.roll }));
    const rolledFirst = correctedLensRotation(
      rolled,
      deltaOf({ yaw: SMALL.yaw, pitch: SMALL.pitch }),
    );
    for (const [index, value] of one.entries()) {
      expect(Math.abs(value - (rolledFirst[index] ?? NaN))).toBeLessThan(ORDER_TOLERANCE);
    }
  });

  it('names the largest turn about any one axis', () => {
    expect(largestComponentOf(SMALL)).toBe(1.5);
    const pitched = deltaOf({ pitch: degrees(-2) });
    expect(largestComponentOf(pitched)).toBe(2);
  });
});
