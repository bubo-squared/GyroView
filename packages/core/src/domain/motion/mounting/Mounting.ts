import {
  IDENTITY_MATRIX3,
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  transformVector,
  transposeMatrix,
  type Matrix3,
} from '../../../shared/math/Matrix3';
import { indexOfLeast } from '../../../shared/math/minimum';
import { addVectors, dotProduct, ZERO_VECTOR3, type Vector3 } from '../../../shared/math/Vector3';
import {
  degrees,
  degreesToRadians,
  HALF_TURN,
  QUARTER_TURN,
  type Radians,
} from '../../../shared/units/angle';
import type { GyroTrack } from '../gyro/GyroTrack';
import { toBodyFrame, type ImuFrame } from '../imu/ImuFrame';
import { measuredGravity } from '../orientation/gravity';

/**
 * How the camera stood through a recording: its body turned a quarter or half turn from the
 * upright frame, whose y is down along the recording's gravity. Lens 0 stays the upright frame's
 * forward when gravity lies across its axis; a camera whose lens axis is the vertical, as a
 * drone's is, faces the body's minus x, where Insta360 Studio centres the Antigravity A1's
 * footage (ADR 0038).
 */
export interface Mounting {
  readonly name: string;
  /**
   * Turns upright-frame vectors into body-frame vectors.
   */
  readonly toBody: Matrix3;
}

const QUARTER_TURN_ANGLE = degreesToRadians(QUARTER_TURN);
const MINUS_QUARTER_TURN_ANGLE = degreesToRadians(degrees(-QUARTER_TURN));
const HALF_TURN_ANGLE = degreesToRadians(HALF_TURN);

export const UPRIGHT_MOUNTING: Mounting = { name: 'upright', toBody: IDENTITY_MATRIX3 };

const DOWN: Vector3 = [0, 1, 0];

/**
 * The six ways a camera can stand, one for each body axis gravity can lie along.
 */
const MOUNTINGS: readonly Mounting[] = [
  UPRIGHT_MOUNTING,
  { name: 'upside down', toBody: rotationAboutZ(HALF_TURN_ANGLE) },
  { name: 'on its right side', toBody: rotationAboutZ(MINUS_QUARTER_TURN_ANGLE) },
  { name: 'on its left side', toBody: rotationAboutZ(QUARTER_TURN_ANGLE) },
  { name: 'with lens 0 up', toBody: lensVertical(MINUS_QUARTER_TURN_ANGLE) },
  { name: 'with lens 0 down', toBody: lensVertical(QUARTER_TURN_ANGLE) },
];

/**
 * A quarter turn about the vertical faces the upright frame along the body's minus x, then a
 * quarter turn about the lateral axis stands lens 0's axis up or down.
 */
function lensVertical(tilt: Radians): Matrix3 {
  return multiplyMatrices(rotationAboutX(tilt), rotationAboutY(MINUS_QUARTER_TURN_ANGLE));
}

/**
 * The mounting whose down lies nearest the gravity the accelerometer measured whenever the camera
 * rested, read through the IMU frame; upright for a camera that never rests. Quarter turns only,
 * so the picture keeps every tilt the camera really took.
 */
export function mountingOf(gyro: GyroTrack, frame: ImuFrame): Mounting {
  const gravity = restingGravitySumOf(gyro, frame);
  const misalignments = MOUNTINGS.map(
    (mounting) => -dotProduct(transformVector(mounting.toBody, DOWN), gravity),
  );
  return MOUNTINGS[indexOfLeast(misalignments)] ?? UPRIGHT_MOUNTING;
}

/**
 * The IMU frame as it lies in the mounting's upright frame: what the camera's orientation is
 * integrated in, so that levelling and heading start from the camera as it stood.
 */
export function uprightImuFrame(frame: ImuFrame, mounting: Mounting): ImuFrame {
  return { ...frame, toBody: multiplyMatrices(transposeMatrix(mounting.toBody), frame.toBody) };
}

function restingGravitySumOf(gyro: GyroTrack, frame: ImuFrame): Vector3 {
  let sum = ZERO_VECTOR3;
  for (let index = 0; index < gyro.length; index += 1) {
    const gravity = measuredGravity(toBodyFrame(frame, gyro.sampleAt(index).acceleration));
    if (gravity) sum = addVectors(sum, gravity);
  }
  return sum;
}
