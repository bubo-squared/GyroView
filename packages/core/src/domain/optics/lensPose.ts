import type { LensCalibration } from './LensCalibration';
import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  transformVector,
  transposeMatrix,
  type Matrix3,
} from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import {
  degrees,
  degreesToRadians,
  HALF_TURN,
  QUARTER_TURN,
  type Degrees,
} from '../../shared/units/angle';

/**
 * The optical axis in the lens frame the models project from.
 */
const OPTICAL_AXIS: Vector3 = [0, 0, 1];

/**
 * The roll the rotation applies for a calibration roll: mirrored about the sensor's mounting,
 * the quarter turn nearest to it, since the strings measure the in-plane roll in the other sense
 * than the lens frame turns (measured on two X5 units, ADR 0025). The mounting itself is kept,
 * so a sensor mounted sideways, as on the X5, or upright stays so.
 */
export function mirroredRoll(roll: Degrees): Degrees {
  const mounting = Math.round(roll / QUARTER_TURN) * QUARTER_TURN;
  return degrees(2 * mounting - roll);
}

/**
 * Turns directions in the camera body frame (x right, y down, z forward along lens 0's optical
 * axis) into the lens frame the {@link LensCalibration.model} projects from.
 *
 * The calibration's yaw (about the body's vertical) and pitch (about its lateral axis) turn each
 * lens in the body frame, alike for both lenses; then lens `i` turns half a turn per lens index
 * about the lateral axis to face backwards, its sensor upside down relative to the front one
 * (ADR 0008); then the roll turns the image about the optical axis, read mirrored
 * ({@link mirroredRoll}), the order measured in ADR 0025. The X5 strings carry a roll near 90
 * degrees for both lenses and no half turn, which is why the facing is part of the convention.
 */
export function lensRotation(lens: LensCalibration): Matrix3 {
  const { yaw, pitch, roll } = lens.orientation;
  const yawed = rotationAboutY(degreesToRadians(yaw));
  const pitched = multiplyMatrices(rotationAboutX(degreesToRadians(pitch)), yawed);
  const facing = rotationAboutX(degreesToRadians(degrees(HALF_TURN * lens.lensIndex)));
  const faced = multiplyMatrices(facing, pitched);
  const rolled = rotationAboutZ(degreesToRadians(mirroredRoll(roll)));
  return multiplyMatrices(rolled, faced);
}

/**
 * A lens's optical axis in the body frame, from its body-to-lens rotation.
 */
export function opticalAxisOf(rotation: Matrix3): Vector3 {
  return transformVector(transposeMatrix(rotation), OPTICAL_AXIS);
}
