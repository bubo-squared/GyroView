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
import {
  addVectors,
  dotProduct,
  magnitudeOf,
  ZERO_VECTOR3,
  type Vector3,
} from '../../../shared/math/Vector3';
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
import type { OrientationTrack } from '../orientation/OrientationTrack';

/**
 * How the camera stood through a recording: its body turned a quarter or half turn from the
 * upright frame, whose y is down along the recording's gravity. Lens 0 stays the upright frame's
 * forward when gravity lies across its axis; a camera whose lens axis is the vertical, as a
 * drone's is, faces the body's minus x, where Insta360 Studio centres the Antigravity A1's
 * footage (ADR 0038). Named in the body frame, not by how the camera looks: an X camera held
 * upright on a stick holds its body's x down and stands "on its right side".
 */
export interface Mounting {
  readonly name: string;
  /**
   * Turns upright-frame vectors into body-frame vectors.
   */
  readonly toBody: Matrix3;
}

/**
 * The orientation of a camera's upright frame over a recording and the mounting that carries it
 * into the body: valid only together, as they were integrated.
 */
export interface MountedMotion {
  readonly orientations: OrientationTrack;
  readonly mounting: Mounting;
}

const QUARTER_TURN_ANGLE = degreesToRadians(QUARTER_TURN);
const MINUS_QUARTER_TURN_ANGLE = degreesToRadians(degrees(-QUARTER_TURN));
const HALF_TURN_ANGLE = degreesToRadians(HALF_TURN);

export const UPRIGHT_MOUNTING: Mounting = { name: 'upright', toBody: IDENTITY_MATRIX3 };

const DOWN: Vector3 = [0, 1, 0];
const LENS_AXIS: Vector3 = [0, 0, 1];

/**
 * The four ways a camera can stand with its lens axis level, one for each body axis across it
 * that gravity can lie along.
 */
const LENS_LEVEL_MOUNTINGS: readonly Mounting[] = [
  UPRIGHT_MOUNTING,
  { name: 'upside down', toBody: rotationAboutZ(HALF_TURN_ANGLE) },
  { name: 'on its right side', toBody: rotationAboutZ(MINUS_QUARTER_TURN_ANGLE) },
  { name: 'on its left side', toBody: rotationAboutZ(QUARTER_TURN_ANGLE) },
];

/**
 * The two ways a camera can stand with its lens axis the vertical.
 */
const LENS_VERTICAL_MOUNTINGS: readonly Mounting[] = [
  { name: 'with lens 0 up', toBody: lensVertical(MINUS_QUARTER_TURN_ANGLE) },
  { name: 'with lens 0 down', toBody: lensVertical(QUARTER_TURN_ANGLE) },
];

/**
 * How near the lens axis gravity must lie for the camera to stand lens-vertical. A drone's lens
 * axis, or a camera's laid flat, lies within a few degrees of the vertical; a camera leaning
 * further on a stick keeps facing where lens 0 looks. The nearest of all six mountings would turn
 * the opening view a quarter or half turn between a lean of 44 and one of 46 degrees.
 */
const LENS_VERTICAL_CONE_DEGREES = 30;
const LENS_VERTICAL_CONE_COSINE = Math.cos(degreesToRadians(degrees(LENS_VERTICAL_CONE_DEGREES)));

/**
 * A quarter turn about the vertical faces the upright frame along the body's minus x, then a
 * quarter turn about the lateral axis stands lens 0's axis up or down.
 */
function lensVertical(tilt: Radians): Matrix3 {
  return multiplyMatrices(rotationAboutX(tilt), rotationAboutY(MINUS_QUARTER_TURN_ANGLE));
}

/**
 * The mounting whose down lies nearest the gravity the accelerometer measured whenever the camera
 * rested, read through the IMU frame: lens-vertical within its cone of the lens axis, lens-level
 * outside it. Quarter turns only, so the picture keeps every tilt the camera really took.
 * Upright for a camera that never rests, and for one whose IMU frame is a guess: read through a
 * wrong frame, gravity would stand the picture on its side or on its head.
 */
export function mountingOf(gyro: GyroTrack, frame: ImuFrame): Mounting {
  if (!frame.isVerified) return UPRIGHT_MOUNTING;
  const gravity = restingGravitySumOf(gyro, frame);
  const mountings = isNearLensAxis(gravity) ? LENS_VERTICAL_MOUNTINGS : LENS_LEVEL_MOUNTINGS;
  const misalignments = mountings.map(
    (mounting) => -dotProduct(transformVector(mounting.toBody, DOWN), gravity),
  );
  return mountings[indexOfLeast(misalignments)] ?? UPRIGHT_MOUNTING;
}

function isNearLensAxis(gravity: Vector3): boolean {
  const alongLensAxis = Math.abs(dotProduct(gravity, LENS_AXIS));
  return alongLensAxis > LENS_VERTICAL_CONE_COSINE * magnitudeOf(gravity);
}

/**
 * The IMU frame as it lies in the mounting's upright frame: what the camera's orientation is
 * integrated in, so that levelling and heading start from the camera as it stood. Its `toBody`
 * reads into the upright frame, which stands for the body throughout the integration.
 */
export function uprightImuFrame(frame: ImuFrame, mounting: Mounting): ImuFrame {
  return { ...frame, toBody: multiplyMatrices(transposeMatrix(mounting.toBody), frame.toBody) };
}

/**
 * A rotation into the mounting's upright frame, such as a stabilizer's, carried on into the body
 * the lenses are posed in.
 */
export function rotationIntoBody(mounting: Mounting, uprightRotation: Matrix3): Matrix3 {
  return multiplyMatrices(mounting.toBody, uprightRotation);
}

function restingGravitySumOf(gyro: GyroTrack, frame: ImuFrame): Vector3 {
  let sum = ZERO_VECTOR3;
  for (let index = 0; index < gyro.length; index += 1) {
    const gravity = measuredGravity(toBodyFrame(frame, gyro.sampleAt(index).acceleration));
    if (gravity) sum = addVectors(sum, gravity);
  }
  return sum;
}
