import { stillestWindow } from './estimateGyroBias';
import {
  conjugateQuaternion,
  IDENTITY_QUATERNION,
  quaternionFromAxisAngle,
  rotateVector,
  type Quaternion,
} from '../../../shared/math/Quaternion';
import { magnitudeOf, type Vector3 } from '../../../shared/math/Vector3';
import { radians } from '../../../shared/units/angle';
import type { Seconds } from '../../../shared/units/time';
import type { GyroTrack } from '../gyro/GyroTrack';
import { toBodyFrame, type ImuFrame } from '../imu/ImuFrame';

/**
 * Gravity points down; the world frame's y axis is down, like the body frame's at rest.
 */
export const WORLD_DOWN: Vector3 = [0, 1, 0];

/**
 * Accelerometer magnitudes outside this band (in g) mean the camera is accelerating, so the
 * reading does not tell where down is.
 */
const MIN_RESTING_G = 0.9;
const MAX_RESTING_G = 1.1;

/**
 * Where gravity points in the body frame according to one accelerometer sample, or undefined
 * while the camera accelerates. The accelerometer measures the reaction to gravity, hence the
 * sign flip.
 */
export function measuredGravity(accelerationInBody: Vector3): Vector3 | undefined {
  const magnitude = magnitudeOf(accelerationInBody);
  const isResting = magnitude >= MIN_RESTING_G && magnitude <= MAX_RESTING_G;
  return isResting
    ? [
        -accelerationInBody[0] / magnitude,
        -accelerationInBody[1] / magnitude,
        -accelerationInBody[2] / magnitude,
      ]
    : undefined;
}

/**
 * Mahony's error term: the rotation, in the body frame, that would swing the estimated gravity
 * onto the measured one. Zero while the camera accelerates.
 */
export function gravityCorrection(orientation: Quaternion, accelerationInBody: Vector3): Vector3 {
  const measured = measuredGravity(accelerationInBody);
  if (!measured) return [0, 0, 0];
  const estimated = rotateVector(conjugateQuaternion(orientation), WORLD_DOWN);
  return cross(measured, estimated);
}

/**
 * The pose at the start: the stillest early window's gravity turned onto world down, with no
 * yaw, so the world's forward is the body's forward at the start.
 */
export function initialOrientation(gyro: GyroTrack, frame: ImuFrame, window: Seconds): Quaternion {
  const { start, end } = stillestWindow(gyro, frame, window);
  const sum: [number, number, number] = [0, 0, 0];
  for (let index = start; index < end; index += 1) {
    const acceleration = toBodyFrame(frame, gyro.sampleAt(index).acceleration);
    sum[0] += acceleration[0];
    sum[1] += acceleration[1];
    sum[2] += acceleration[2];
  }
  const count = Math.max(end - start, 1);
  const gravity = measuredGravity([sum[0] / count, sum[1] / count, sum[2] / count]);
  return gravity ? rotationBetween(gravity, WORLD_DOWN) : IDENTITY_QUATERNION;
}

/**
 * The shortest rotation taking unit vector `from` onto unit vector `to`.
 */
export function rotationBetween(from: Vector3, to: Vector3): Quaternion {
  const axis = cross(from, to);
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  const sine = magnitudeOf(axis);
  if (sine > 0) return quaternionFromAxisAngle(axis, radians(Math.atan2(sine, dot)));
  return dot > 0
    ? IDENTITY_QUATERNION
    : quaternionFromAxisAngle(anyPerpendicular(from), radians(Math.PI));
}

function anyPerpendicular(v: Vector3): Vector3 {
  return Math.abs(v[0]) < Math.abs(v[2]) ? [0, -v[2], v[1]] : [-v[1], v[0], 0];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
