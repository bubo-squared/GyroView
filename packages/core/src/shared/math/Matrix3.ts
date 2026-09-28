import type { Vector3 } from './Vector3';
import type { Radians } from '../units/angle';

/**
 * A 3x3 matrix in row-major order: `[m00, m01, m02, m10, m11, m12, m20, m21, m22]`. Rotations
 * are right-handed about the named axis. Immutable by convention.
 */
export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const IDENTITY_MATRIX3: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function rotationAboutX(angle: Radians): Matrix3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function rotationAboutY(angle: Radians): Matrix3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function rotationAboutZ(angle: Radians): Matrix3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/**
 * `a * b`: applying the product to a vector applies `b` first, then `a`.
 */
export function multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = a;
  const [b00, b01, b02, b10, b11, b12, b20, b21, b22] = b;
  return [
    a00 * b00 + a01 * b10 + a02 * b20,
    a00 * b01 + a01 * b11 + a02 * b21,
    a00 * b02 + a01 * b12 + a02 * b22,
    a10 * b00 + a11 * b10 + a12 * b20,
    a10 * b01 + a11 * b11 + a12 * b21,
    a10 * b02 + a11 * b12 + a12 * b22,
    a20 * b00 + a21 * b10 + a22 * b20,
    a20 * b01 + a21 * b11 + a22 * b21,
    a20 * b02 + a21 * b12 + a22 * b22,
  ];
}

/**
 * The transpose, which for a rotation is its inverse.
 */
export function transposeMatrix(m: Matrix3): Matrix3 {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  return [m00, m10, m20, m01, m11, m21, m02, m12, m22];
}

export function transformVector(m: Matrix3, v: Vector3): Vector3 {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const [x, y, z] = v;
  return [m00 * x + m01 * y + m02 * z, m10 * x + m11 * y + m12 * z, m20 * x + m21 * y + m22 * z];
}

/**
 * Positive one for a proper rotation, minus one for a reflection, zero when singular.
 */
export function determinantOf(m: Matrix3): number {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  return (
    m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20)
  );
}
