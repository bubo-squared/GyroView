import { describe, expect, it } from 'vitest';

import {
  IDENTITY_MATRIX3,
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  transformVector,
  transposeMatrix,
} from './Matrix3';
import type { Vector3 } from './Vector3';
import { radians } from '../units/angle';

const QUARTER_TURN = radians(Math.PI / 2);
const X: Vector3 = [1, 0, 0];
const Y: Vector3 = [0, 1, 0];
const Z: Vector3 = [0, 0, 1];

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

describe('Matrix3', () => {
  it('rotates right-handedly about each axis by a quarter turn', () => {
    expectVector(transformVector(rotationAboutX(QUARTER_TURN), Y), Z);
    expectVector(transformVector(rotationAboutY(QUARTER_TURN), Z), X);
    expectVector(transformVector(rotationAboutZ(QUARTER_TURN), X), Y);
  });

  it('applies the right factor of a product first', () => {
    const aboutX = rotationAboutX(QUARTER_TURN);
    const aboutZ = rotationAboutZ(QUARTER_TURN);
    expectVector(transformVector(multiplyMatrices(aboutZ, aboutX), X), Y);
    expectVector(transformVector(multiplyMatrices(aboutX, aboutZ), X), Z);
    const viaIdentity = multiplyMatrices(IDENTITY_MATRIX3, rotationAboutY(QUARTER_TURN));
    expectVector(transformVector(viaIdentity, Z), X);
  });

  it('inverts a rotation by transposing it', () => {
    const rotation = multiplyMatrices(rotationAboutZ(radians(0.3)), rotationAboutX(radians(-1.1)));
    const roundTrip = multiplyMatrices(transposeMatrix(rotation), rotation);
    for (const [index, value] of IDENTITY_MATRIX3.entries()) {
      expect(roundTrip[index]).toBeCloseTo(value, 9);
    }
  });
});
