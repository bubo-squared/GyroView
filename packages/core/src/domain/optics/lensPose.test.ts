import { describe, expect, it } from 'vitest';

import { EquidistantModel } from './EquidistantModel';
import { HALF_FIELD_OF_VIEW } from './opticsConstants';
import type { LensCalibration } from './LensCalibration';
import { lensRotation, opticalAxisOf } from './lensPose';
import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutZ,
  transformVector,
  type Matrix3,
} from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees, degreesToRadians, HALF_TURN } from '../../shared/units/angle';

interface Pose {
  readonly lensIndex: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly roll?: number;
}

function rotationOf(pose: Pose): Matrix3 {
  const lens: LensCalibration = {
    lensIndex: pose.lensIndex,
    model: new EquidistantModel({
      radius: 500,
      radiusAngle: HALF_FIELD_OF_VIEW,
      principalPoint: { x: 500, y: 500 },
    }),
    orientation: {
      yaw: degrees(pose.yaw ?? 0),
      pitch: degrees(pose.pitch ?? 0),
      roll: degrees(pose.roll ?? 0),
    },
    translation: [0, 0, 0],
  };
  return lensRotation(lens);
}

/**
 * A turn of the image about the optical axis by `angle` degrees, nothing else.
 */
function rotationOfTurn(angle: number): Matrix3 {
  return rotationAboutZ(degreesToRadians(degrees(angle)));
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

  it('reads the roll mirrored about the sensor mounting: 89.6 degrees turns the image as 90.4 would', () => {
    const read = rotationOf({ lensIndex: 0, roll: 89.6 });
    const mirrored = rotationOfTurn(90.4);
    for (const [index, value] of mirrored.entries()) expect(read[index]).toBeCloseTo(value, 9);
  });

  it('mirrors the roll about the nearest quarter turn, so a sensor mounted upright stays upright', () => {
    const read = rotationOf({ lensIndex: 0, roll: 0.3 });
    const mirrored = rotationOfTurn(-0.3);
    for (const [index, value] of mirrored.entries()) expect(read[index]).toBeCloseTo(value, 9);
  });

  it('mirrors the back lens roll as the front one: the half turn stays about the lateral axis', () => {
    const read = rotationOf({ lensIndex: 1, roll: 89.6 });
    const expected = multiplyMatrices(
      rotationOfTurn(90.4),
      rotationAboutX(degreesToRadians(HALF_TURN)),
    );
    for (const [index, value] of expected.entries()) expect(read[index]).toBeCloseTo(value, 9);
  });

  it('turns both lenses alike about the body axes by their yaw and pitch, before the back lens faces backwards', () => {
    const back = rotationOf({ lensIndex: 1, yaw: 0.6, pitch: -0.2 });
    const front = rotationOf({ lensIndex: 0, yaw: 0.6, pitch: -0.2 });
    const expected = multiplyMatrices(rotationAboutX(degreesToRadians(HALF_TURN)), front);
    for (const [index, value] of expected.entries()) expect(back[index]).toBeCloseTo(value, 9);
  });

  it('applies yaw about the vertical axis and pitch about the lateral axis before the roll', () => {
    const yawed = rotationOf({ lensIndex: 0, yaw: 90 });
    const pitched = rotationOf({ lensIndex: 0, pitch: 90 });
    expectVector(transformVector(yawed, FORWARD), RIGHT);
    expectVector(transformVector(pitched, FORWARD), [0, -1, 0]);
  });
});

describe('opticalAxisOf', () => {
  it("is the lens's axis in the body frame: lens 0 forward, lens 1 backward", () => {
    expectVector(opticalAxisOf(rotationOf({ lensIndex: 0 })), FORWARD);
    expectVector(opticalAxisOf(rotationOf({ lensIndex: 1 })), BACKWARD);
  });

  it('follows the yaw the calibration gives both lenses', () => {
    const diagonal = Math.SQRT1_2;
    expectVector(opticalAxisOf(rotationOf({ lensIndex: 0, yaw: 45 })), [-diagonal, 0, diagonal]);
  });
});
