import { meanOverWindow, type SampleWindow } from './estimateGyroBias';
import {
  conjugateQuaternion,
  IDENTITY_QUATERNION,
  quaternionFromAxisAngle,
  rotateVector,
  type Quaternion,
} from '../../../shared/math/Quaternion';
import { crossProduct, dotProduct, magnitudeOf, type Vector3 } from '../../../shared/math/Vector3';
import { radians } from '../../../shared/units/angle';
import { secondsToMicroseconds, type Seconds } from '../../../shared/units/time';
import type { GyroTrack } from '../gyro/GyroTrack';
import type { ImuFrame } from '../imu/ImuFrame';

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
function measuredGravity(accelerationInBody: Vector3): Vector3 | undefined {
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
  return crossProduct(measured, estimated);
}

/**
 * The samples within the first `length` seconds of the track, at least the first one.
 */
function openingWindow(gyro: GyroTrack, length: Seconds): SampleWindow {
  if (gyro.isEmpty) return { start: 0, end: 0 };
  const first = gyro.sampleAt(0).captureTime;
  const span = secondsToMicroseconds(length);
  let end = 1;
  while (end < gyro.length && gyro.sampleAt(end).captureTime - first <= span) end += 1;
  return { start: 0, end };
}

/**
 * The pose at the start: the gravity measured over the opening window turned onto world down,
 * with no yaw, so the world's forward is the body's forward at the start. Identity when the
 * camera accelerates in that window; the gravity pull levels the estimate over the next seconds.
 */
export function initialOrientation(gyro: GyroTrack, frame: ImuFrame, window: Seconds): Quaternion {
  if (gyro.isEmpty) return IDENTITY_QUATERNION;
  const opening = openingWindow(gyro, window);
  const gravity = measuredGravity(
    meanOverWindow({ gyro, frame }, opening, (sample) => sample.acceleration),
  );
  return gravity ? rotationBetween(gravity, WORLD_DOWN) : IDENTITY_QUATERNION;
}

/**
 * The shortest rotation taking unit vector `from` onto unit vector `to`.
 */
function rotationBetween(from: Vector3, to: Vector3): Quaternion {
  const axis = crossProduct(from, to);
  const dot = dotProduct(from, to);
  const sine = magnitudeOf(axis);
  if (sine > 0) return quaternionFromAxisAngle(axis, radians(Math.atan2(sine, dot)));
  return dot > 0
    ? IDENTITY_QUATERNION
    : quaternionFromAxisAngle(anyPerpendicular(from), radians(Math.PI));
}

function anyPerpendicular(v: Vector3): Vector3 {
  return Math.abs(v[0]) < Math.abs(v[2]) ? [0, -v[2], v[1]] : [-v[1], v[0], 0];
}
