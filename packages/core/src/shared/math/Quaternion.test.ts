import { describe, expect, it } from 'vitest';

import { rotationAboutY, transformVector } from './Matrix3';
import {
  conjugateQuaternion,
  IDENTITY_QUATERNION,
  multiplyQuaternions,
  quaternionFromAxisAngle,
  quaternionFromRotationVector,
  quaternionToMatrix,
  rotateVector,
  slerpQuaternions,
} from './Quaternion';
import type { Vector3 } from './Vector3';
import { radians } from '../units/angle';

const QUARTER_TURN = radians(Math.PI / 2);
const X: Vector3 = [1, 0, 0];
const Y: Vector3 = [0, 1, 0];
const Z: Vector3 = [0, 0, 1];

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

describe('Quaternion', () => {
  it('rotates like the matrix of the same axis and angle', () => {
    const aboutY = quaternionFromAxisAngle(Y, QUARTER_TURN);
    expectVector(rotateVector(aboutY, Z), X);
    const viaMatrix = transformVector(quaternionToMatrix(aboutY), Z);
    expectVector(viaMatrix, transformVector(rotationAboutY(QUARTER_TURN), Z));
  });

  it('composes with the right factor applied first and inverts by conjugation', () => {
    const aboutX = quaternionFromAxisAngle(X, QUARTER_TURN);
    const aboutY = quaternionFromAxisAngle(Y, QUARTER_TURN);
    expectVector(rotateVector(multiplyQuaternions(aboutX, aboutY), Z), [1, 0, 0]);
    expectVector(rotateVector(multiplyQuaternions(aboutY, aboutX), Z), [0, -1, 0]);
    const roundTrip = multiplyQuaternions(conjugateQuaternion(aboutX), aboutX);
    for (const [index, value] of IDENTITY_QUATERNION.entries()) {
      expect(roundTrip[index]).toBeCloseTo(value, 9);
    }
  });

  it('integrates an angular velocity through the exponential map', () => {
    const omega: Vector3 = [0, Math.PI / 2, 0];
    expectVector(rotateVector(quaternionFromRotationVector(omega), Z), X);
    expect(quaternionFromRotationVector([0, 0, 0])).toBe(IDENTITY_QUATERNION);
  });

  it('interpolates half way along the shorter arc', () => {
    const halfTurn = quaternionFromAxisAngle(Y, radians(Math.PI));
    const midway = slerpQuaternions(IDENTITY_QUATERNION, halfTurn, 0.5);
    expectVector(rotateVector(midway, Z), X);
    const nearly = quaternionFromAxisAngle(Y, radians(1e-4));
    expectVector(rotateVector(slerpQuaternions(IDENTITY_QUATERNION, nearly, 0.5), Z), [
      Math.sin(5e-5),
      0,
      Math.cos(5e-5),
    ]);
    const flipped: [number, number, number, number] = [
      -halfTurn[0],
      -halfTurn[1],
      -halfTurn[2],
      -halfTurn[3],
    ];
    expectVector(rotateVector(slerpQuaternions(IDENTITY_QUATERNION, flipped, 0.5), Z), X);
  });
});
