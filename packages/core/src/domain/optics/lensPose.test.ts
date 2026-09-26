import { describe, expect, it } from 'vitest';

import { EquidistantModel } from './EquidistantModel';
import type { LensCalibration } from './LensCalibration';
import { lensRotation } from './lensPose';
import { transformVector, type Matrix3 } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';

interface Pose {
  readonly lensIndex: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly roll?: number;
}

function rotationOf(pose: Pose): Matrix3 {
  const lens: LensCalibration = {
    lensIndex: pose.lensIndex,
    model: new EquidistantModel({ edgeRadius: 500, principalPoint: { x: 500, y: 500 } }),
    orientation: {
      yaw: degrees(pose.yaw ?? 0),
      pitch: degrees(pose.pitch ?? 0),
      roll: degrees(pose.roll ?? 0),
    },
    translation: [0, 0, 0],
  };
  return lensRotation(lens);
}

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

const FORWARD: Vector3 = [0, 0, 1];
const BACKWARD: Vector3 = [0, 0, -1];
const RIGHT: Vector3 = [1, 0, 0];
const DOWN: Vector3 = [0, 1, 0];

describe('lensRotation', () => {
  it('leaves the first lens aligned with the body when its angles are zero', () => {
    const rotation = rotationOf({ lensIndex: 0 });
    expectVector(transformVector(rotation, FORWARD), FORWARD);
    expectVector(transformVector(rotation, RIGHT), RIGHT);
  });

  it('turns the second lens to face backwards, mounted upside down: body-down lands image-up', () => {
    const rotation = rotationOf({ lensIndex: 1 });
    expectVector(transformVector(rotation, BACKWARD), FORWARD);
    expectVector(transformVector(rotation, RIGHT), RIGHT);
    expectVector(transformVector(rotation, DOWN), [0, -1, 0]);
  });

  it('applies a 90 degree roll as the sensor mounted sideways: body-right lands image-down', () => {
    const rotation = rotationOf({ lensIndex: 0, roll: 90 });
    expectVector(transformVector(rotation, RIGHT), DOWN);
    expectVector(transformVector(rotation, FORWARD), FORWARD);
  });

  it('applies yaw about the vertical axis and pitch about the lateral axis before the roll', () => {
    const yawed = rotationOf({ lensIndex: 0, yaw: 90 });
    const pitched = rotationOf({ lensIndex: 0, pitch: 90 });
    expectVector(transformVector(yawed, FORWARD), RIGHT);
    expectVector(transformVector(pitched, FORWARD), [0, -1, 0]);
  });
});
