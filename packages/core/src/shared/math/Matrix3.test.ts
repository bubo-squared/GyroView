import { describe, expect, it } from 'vitest';

import {
  determinantOf,
  IDENTITY_MATRIX3,
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  transformVector,
  transposeMatrix,
  type Matrix3,
} from './Matrix3';
import type { Vector3 } from './Vector3';
import { radians } from '../units/angle';

const QUARTER_TURN = radians(Math.PI / 2);
const X: Vector3 = [1, 0, 0];
const Y: Vector3 = [0, 1, 0];
const Z: Vector3 = [0, 0, 1];
const DENSE_A: Matrix3 = [1, 2, 3, 4, 5, 6, 7, 8, 10];
const DENSE_B: Matrix3 = [-2, 0, 1, 3, -1, 4, 0, 5, -3];
const SKEW: Vector3 = [0.3, -1.2, 2.1];

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

describe('Matrix3', () => {
  it('rotates right-handedly about each axis by a quarter turn', () => {
    expectVector(transformVector(rotationAboutX(QUARTER_TURN), Y), Z);
    expectVector(transformVector(rotationAboutY(QUARTER_TURN), Z), X);
    expectVector(transformVector(rotationAboutY(QUARTER_TURN), X), [0, 0, -1]);
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

  it('multiplies dense matrices like applying them one after the other', () => {
    const product = transformVector(multiplyMatrices(DENSE_A, DENSE_B), SKEW);
    const sequential = transformVector(DENSE_A, transformVector(DENSE_B, SKEW));
    expectVector(product, sequential);
    expect(multiplyMatrices(DENSE_A, DENSE_B)).toEqual([4, 13, 0, 7, 25, 6, 10, 42, 9]);
  });

  it('inverts a rotation by transposing it', () => {
    const rotation = multiplyMatrices(rotationAboutZ(radians(0.3)), rotationAboutX(radians(-1.1)));
    const roundTrip = multiplyMatrices(transposeMatrix(rotation), rotation);
    for (const [index, value] of IDENTITY_MATRIX3.entries()) {
      expect(roundTrip[index]).toBeCloseTo(value, 9);
    }
    expect(transposeMatrix(DENSE_A)).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 10]);
  });

  it('tells rotations from reflections and singular matrices by their determinant', () => {
    const rotation = rotationAboutX(radians(0.7));
    expect(determinantOf(rotation)).toBeCloseTo(1, 9);
    expect(determinantOf([1, 0, 0, 0, 1, 0, 0, 0, -1])).toBe(-1);
    expect(determinantOf([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBe(0);
    expect(determinantOf(DENSE_A)).toBe(-3);
  });
});
