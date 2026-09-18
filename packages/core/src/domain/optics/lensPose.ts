import type { LensCalibration } from './LensCalibration';
import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  type Matrix3,
} from '../../shared/math/Matrix3';
import { degreesToRadians, radians } from '../../shared/units/angle';

const HALF_TURN = radians(Math.PI);

/**
 * Turns directions in the camera body frame (x right, y down, z forward along lens 0's optical
 * axis) into the lens frame the {@link LensCalibration.model} projects from.
 *
 * Convention checked on the X5 office recording (ADR 0008): the lenses sit on opposite faces
 * with the back sensor mounted upside down relative to the front one, so lens `i` first turns
 * half a turn per lens index about the body's lateral axis; then the calibration's yaw (about
 * y), pitch (about x) and roll (about the optical axis) are applied in that order. The X5
 * strings carry a roll near 90 degrees for both lenses and no half turn, which is why the
 * facing is part of the convention.
 */
export function lensRotation(lens: LensCalibration): Matrix3 {
  const { yaw, pitch, roll } = lens.orientation;
  const facing = rotationAboutX(radians(HALF_TURN * lens.lensIndex));
  const yawed = multiplyMatrices(rotationAboutY(degreesToRadians(yaw)), facing);
  const pitched = multiplyMatrices(rotationAboutX(degreesToRadians(pitch)), yawed);
  return multiplyMatrices(rotationAboutZ(degreesToRadians(roll)), pitched);
}
