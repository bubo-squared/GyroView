import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  type Matrix3,
} from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, type Degrees } from '../../shared/units/angle';

/**
 * A small turn of a lens beyond its calibration, about the camera body's axes: yaw about y
 * (down), pitch about x (right), roll about z (lens 0's axis). A roll is the "turn of the back
 * lens about lens 0's axis" the seam measurements found.
 */
export interface PoseDelta {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly roll: Degrees;
}

export const ZERO_POSE_DELTA: PoseDelta = { yaw: degrees(0), pitch: degrees(0), roll: degrees(0) };

/**
 * The factory body-to-lens rotation with the delta's turn applied to the body directions
 * first: yaw, then pitch, then roll. Below a degree or two the order changes the result by
 * less than the search resolves.
 */
export function correctedLensRotation(factory: Matrix3, delta: PoseDelta): Matrix3 {
  const yawed = rotationAboutY(degreesToRadians(delta.yaw));
  const pitched = rotationAboutX(degreesToRadians(delta.pitch));
  const rolled = rotationAboutZ(degreesToRadians(delta.roll));
  return multiplyMatrices(factory, multiplyMatrices(yawed, multiplyMatrices(pitched, rolled)));
}

export function isZeroDelta(delta: PoseDelta): boolean {
  return delta.yaw === 0 && delta.pitch === 0 && delta.roll === 0;
}

/**
 * The delta's largest turn about any one axis, ignoring its sign.
 */
export function largestComponentOf(delta: PoseDelta): Degrees {
  return degrees(Math.max(Math.abs(delta.yaw), Math.abs(delta.pitch), Math.abs(delta.roll)));
}
