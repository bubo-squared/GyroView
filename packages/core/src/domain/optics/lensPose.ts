import type { LensCalibration } from './LensCalibration';
import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  type Matrix3,
} from '../../shared/math/Matrix3';
import {
  degrees,
  degreesToRadians,
  HALF_TURN,
  QUARTER_TURN,
  type Degrees,
} from '../../shared/units/angle';

/**
 * The roll the rotation applies for a calibration roll: mirrored about the sensor's mounting,
 * the quarter turn nearest to it. The strings measure the in-plane roll in the other sense than
 * the lens frame turns: registered alone on Insta360 Studio's stitch, about its own axis, the
 * back lens sits 0.83 degrees from the front one on the sailing X5 read as written, and 0.07
 * read mirrored; on the office X5, 0.88 and 0.09 (ADR 0025). The mounting itself is kept, so a
 * sensor mounted sideways, as on the X5, or upright stays so.
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
 * ({@link mirroredRoll}). Registering each X5 lens alone on Insta360 Studio's stitch of the
 * sailing recording measured this order (ADR 0025): the half turn first would turn the back
 * lens's yaw the other way and leave the lenses 1.1 degrees apart about the vertical. The X5
 * strings carry a roll near 90 degrees for both lenses and no half turn, which
 * is why the facing is part of the convention.
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
