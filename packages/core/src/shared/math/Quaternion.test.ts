import { describe, expect, it } from 'vitest';

import { multiplyMatrices, rotationAboutY, transformVector } from './Matrix3';
import {
  conjugateQuaternion,
  IDENTITY_QUATERNION,
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionFromAxisAngle,
  quaternionFromRotationVector,
  quaternionToMatrix,
  rotateVector,
  slerpQuaternions,
  type Quaternion,
} from './Quaternion';
import type { Vector3 } from './Vector3';
import { radians } from '../units/angle';

const QUARTER_TURN = radians(Math.PI / 2);
const X: Vector3 = [1, 0, 0];
const Y: Vector3 = [0, 1, 0];
const Z: Vector3 = [0, 0, 1];
const SKEW: Vector3 = [0.3, -1.2, 2.1];
const TILTED_AXIS: Vector3 = [1, 2, -0.5];
const OTHER_AXIS: Vector3 = [-0.7, 0.2, 1.1];

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

function expectQuaternionRotation(actual: Quaternion, expected: Quaternion): void {
  for (const probe of [X, Y, Z, SKEW])
    expectVector(rotateVector(actual, probe), rotateVector(expected, probe));
}

describe('Quaternion', () => {
  it('rotates like the matrix of the same axis and angle', () => {
    const aboutY = quaternionFromAxisAngle(Y, QUARTER_TURN);
    expectVector(rotateVector(aboutY, Z), X);
    const viaMatrix = transformVector(quaternionToMatrix(aboutY), Z);
    expectVector(viaMatrix, transformVector(rotationAboutY(QUARTER_TURN), Z));
  });

  it('agrees with its matrix for a rotation about a tilted axis, on a skew vector', () => {
    const tilted = quaternionFromAxisAngle(TILTED_AXIS, radians(1.3));
    expectVector(rotateVector(tilted, SKEW), transformVector(quaternionToMatrix(tilted), SKEW));
    const other = quaternionFromAxisAngle(OTHER_AXIS, radians(-2.2));
    const productMatrix = multiplyMatrices(quaternionToMatrix(tilted), quaternionToMatrix(other));
    expectVector(
      rotateVector(multiplyQuaternions(tilted, other), SKEW),
      transformVector(productMatrix, SKEW),
    );
  });

  it('composes with the right factor applied first and inverts by conjugation', () => {
    const aboutX = quaternionFromAxisAngle(X, QUARTER_TURN);
    const aboutY = quaternionFromAxisAngle(Y, QUARTER_TURN);
    expectVector(rotateVector(multiplyQuaternions(aboutX, aboutY), Z), [1, 0, 0]);
    expectVector(rotateVector(multiplyQuaternions(aboutY, aboutX), Z), [0, -1, 0]);
    const tilted = quaternionFromAxisAngle(TILTED_AXIS, radians(0.9));
    expectVector(rotateVector(conjugateQuaternion(tilted), rotateVector(tilted, SKEW)), SKEW);
  });

  it('integrates an angular velocity through the exponential map', () => {
    const omega: Vector3 = [0, Math.PI / 2, 0];
    expectVector(rotateVector(quaternionFromRotationVector(omega), Z), X);
    expect(quaternionFromRotationVector([0, 0, 0])).toBe(IDENTITY_QUATERNION);
    expect(quaternionFromAxisAngle([0, 0, 0], radians(1))).toBe(IDENTITY_QUATERNION);
  });

  it('normalises any non-zero quaternion and falls back to the identity for zero', () => {
    const [x, y, z, w] = normalizeQuaternion([2, 0, 0, 2]);
    expect(x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(w).toBeCloseTo(Math.SQRT1_2, 12);
    expect([y, z]).toEqual([0, 0]);
    expect(normalizeQuaternion([0, 0, 0, 0])).toBe(IDENTITY_QUATERNION);
  });

  it('interpolates half way along the shorter arc, whichever sign the target carries', () => {
    const halfTurn = quaternionFromAxisAngle(Y, radians(Math.PI));
    expectVector(rotateVector(slerpQuaternions(IDENTITY_QUATERNION, halfTurn, 0.5), Z), X);
    const flipped: Quaternion = [-halfTurn[0], -halfTurn[1], -halfTurn[2], -halfTurn[3]];
    expectQuaternionRotation(
      slerpQuaternions(IDENTITY_QUATERNION, flipped, 0.5),
      slerpQuaternions(IDENTITY_QUATERNION, halfTurn, 0.5),
    );
    const tilted = quaternionFromAxisAngle(TILTED_AXIS, radians(2));
    expectQuaternionRotation(
      slerpQuaternions(IDENTITY_QUATERNION, tilted, 0.25),
      quaternionFromAxisAngle(TILTED_AXIS, radians(0.5)),
    );
    expectQuaternionRotation(slerpQuaternions(IDENTITY_QUATERNION, tilted, 0), IDENTITY_QUATERNION);
    expectQuaternionRotation(slerpQuaternions(IDENTITY_QUATERNION, tilted, 1), tilted);
  });

  it('interpolates nearly parallel quaternions linearly without losing unit length', () => {
    const nearly = quaternionFromAxisAngle(TILTED_AXIS, radians(1e-4));
    const midway = slerpQuaternions(IDENTITY_QUATERNION, nearly, 0.5);
    expect(Math.hypot(...midway)).toBeCloseTo(1, 12);
    expectQuaternionRotation(midway, quaternionFromAxisAngle(TILTED_AXIS, radians(5e-5)));
  });
});
