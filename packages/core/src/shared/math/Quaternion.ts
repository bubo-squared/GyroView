import type { Matrix3 } from './Matrix3';
import { magnitudeOf, type Vector3 } from './Vector3';
import { radians, type Radians } from '../units/angle';

/**
 * A unit quaternion `[x, y, z, w]` representing a rotation; the same handedness and axis
 * conventions as {@link Matrix3}. Immutable by convention.
 */
export type Quaternion = readonly [x: number, y: number, z: number, w: number];

export const IDENTITY_QUATERNION: Quaternion = [0, 0, 0, 1];

/**
 * Rotations smaller than this, in radians, are treated as no rotation by the exponential map.
 */
const NEGLIGIBLE_ANGLE = 1e-12;
/**
 * Below this dot product two quaternions are far enough apart for a real spherical interpolation.
 */
const NEARLY_PARALLEL = 0.9995;

export function quaternionFromAxisAngle(axis: Vector3, angle: Radians): Quaternion {
  const length = magnitudeOf(axis);
  if (length === 0) return IDENTITY_QUATERNION;
  const half = angle / 2;
  const scale = Math.sin(half) / length;
  return [axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(half)];
}

/**
 * Exponential map: the rotation of `|omega|` radians about `omega`, for example an angular
 * velocity times a time step.
 */
export function quaternionFromRotationVector(omega: Vector3): Quaternion {
  const angle = magnitudeOf(omega);
  return angle < NEGLIGIBLE_ANGLE
    ? IDENTITY_QUATERNION
    : quaternionFromAxisAngle(omega, radians(angle));
}

/**
 * `a * b`: applying the product to a vector applies `b` first, then `a`.
 */
export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * The inverse rotation of a unit quaternion.
 */
export function conjugateQuaternion(q: Quaternion): Quaternion {
  const [x, y, z, w] = q;
  return [-x, -y, -z, w];
}

export function normalizeQuaternion(q: Quaternion): Quaternion {
  const [x, y, z, w] = q;
  // Not Math.hypot, as magnitudeOf says; spelled out, as a helper taking the quaternion apart
  // again cost the gyro integration a tenth of its time.
  // eslint-disable-next-line unicorn/prefer-modern-math-apis -- see above
  const length = Math.sqrt(x * x + y * y + z * z + w * w);
  return length === 0 ? IDENTITY_QUATERNION : [x / length, y / length, z / length, w / length];
}

export function rotateVector(q: Quaternion, v: Vector3): Vector3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  // v' = v + w * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/**
 * Spherical interpolation from `a` (t = 0) to `b` (t = 1) along the shorter arc.
 */
export function slerpQuaternions(a: Quaternion, b: Quaternion, t: number): Quaternion {
  const [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    dot = -dot;
    [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
  }
  if (dot > NEARLY_PARALLEL) {
    return normalizeQuaternion([
      ax + (bx - ax) * t,
      ay + (by - ay) * t,
      az + (bz - az) * t,
      aw + (bw - aw) * t,
    ]);
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const weightA = Math.sin((1 - t) * theta) / sinTheta;
  const weightB = Math.sin(t * theta) / sinTheta;
  return [
    ax * weightA + bx * weightB,
    ay * weightA + by * weightB,
    az * weightA + bz * weightB,
    aw * weightA + bw * weightB,
  ];
}

export function quaternionToMatrix(q: Quaternion): Matrix3 {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}
