import type { Vector3 } from '../../shared/math/Vector3';
import { degrees, degreesToRadians, type Degrees } from '../../shared/units/angle';

/**
 * An arc of azimuths around the seam ring: from `start` up to `end`, in degrees from body +x
 * towards body +y (down).
 */
export interface AzimuthArc {
  readonly start: Degrees;
  readonly end: Degrees;
}

/**
 * The seam strip: the band of body directions around the ring 90 degrees from lens 0's axis,
 * where both lenses see the same scene and their agreement is measured. It is sampled every
 * {@link SEAM_STRIP_STEP} in azimuth and in angle from the axis, and read in azimuth bins of
 * {@link SEAM_BIN_WIDTH}.
 *
 * Azimuth runs from body +x (the right seam) towards body +y (down): 0 right, 90 nadir, 180
 * left, 270 zenith. The two 200-degree X5 lenses overlap between 80 and 100 degrees from their
 * axes; the strip stays 3 degrees clear of both gates, so a candidate pose turned by up to 1.5
 * degrees still samples directions both lenses image.
 */
const STRIP_START_DEGREES = 83;
const STRIP_END_DEGREES = 97;
const STRIP_STEP_DEGREES = 0.5;
const BIN_WIDTH_DEGREES = 5;
const FULL_CIRCLE_DEGREES = 360;
/**
 * A cell is sampled at its centre.
 */
const CELL_CENTRE = 0.5;

export const SEAM_STRIP_THETA_START = degrees(STRIP_START_DEGREES);
export const SEAM_STRIP_THETA_END = degrees(STRIP_END_DEGREES);
export const SEAM_STRIP_STEP = degrees(STRIP_STEP_DEGREES);
export const SEAM_BIN_WIDTH = degrees(BIN_WIDTH_DEGREES);

export const SEAM_STRIP_ROWS = Math.round(
  (SEAM_STRIP_THETA_END - SEAM_STRIP_THETA_START) / SEAM_STRIP_STEP,
);
export const SEAM_STRIP_COLUMNS = Math.round(FULL_CIRCLE_DEGREES / SEAM_STRIP_STEP);
export const SEAM_BIN_COLUMNS = Math.round(SEAM_BIN_WIDTH / SEAM_STRIP_STEP);
export const SEAM_BIN_COUNT = SEAM_STRIP_COLUMNS / SEAM_BIN_COLUMNS;
/**
 * Each cell's disagreement is the mean over this many sub-samples along each side of it, so
 * the cost sees the source's own texture rather than one point every seven pixels: a fifth of
 * the step is a tenth of a degree, about 1.4 pixels of a 5.7K frame and 1.9 of an 8K one.
 */
export const SEAM_CELL_SUBSAMPLES = 5;

/**
 * The arc under the camera, where whatever holds it (a hand, a stick, a deck) is always within a
 * metre and its parallax dwarfs any pose error; left out of the aggregate cost by default.
 */
const NADIR_ARC_START_DEGREES = 60;
const NADIR_ARC_END_DEGREES = 120;
export const NADIR_ARC: AzimuthArc = {
  start: degrees(NADIR_ARC_START_DEGREES),
  end: degrees(NADIR_ARC_END_DEGREES),
};

/**
 * The luma difference (0..1) beyond which two lenses disagree about content, torn by parallax or
 * a near object, rather than about alignment: a direction counts as this much and no more, so
 * no single torn object can own a bin. A quarter of the range.
 */
const CAP_LEVELS = 64;
const CHANNEL_LEVELS = 255;
export const MISMATCH_CAP = CAP_LEVELS / CHANNEL_LEVELS;

/**
 * The azimuth at the centre of a strip column.
 */
export function seamStripAzimuth(column: number): Degrees {
  return degrees((column + CELL_CENTRE) * SEAM_STRIP_STEP);
}

/**
 * The angle from body +z at the centre of a strip row.
 */
export function seamStripTheta(row: number): Degrees {
  return degrees(SEAM_STRIP_THETA_START + (row + CELL_CENTRE) * SEAM_STRIP_STEP);
}

/**
 * The body direction sampled at the centre of a strip cell.
 */
export function seamStripDirection(column: number, row: number): Vector3 {
  const azimuth = degreesToRadians(seamStripAzimuth(column));
  const theta = degreesToRadians(seamStripTheta(row));
  return [
    Math.sin(theta) * Math.cos(azimuth),
    Math.sin(theta) * Math.sin(azimuth),
    Math.cos(theta),
  ];
}

/**
 * The azimuth at the centre of a bin.
 */
export function seamBinAzimuth(bin: number): Degrees {
  return degrees((bin + CELL_CENTRE) * SEAM_BIN_WIDTH);
}

/**
 * A slide of a lens's sampling of the strip: `along` the ring (in azimuth) and `across` it (in
 * the angle from the axis). The local shift that aligns the lenses in one bin, or a candidate
 * for it.
 */
export interface StripShift {
  readonly along: Degrees;
  readonly across: Degrees;
}

export const ZERO_SHIFT: StripShift = { along: degrees(0), across: degrees(0) };

export function isWithinArc(azimuth: Degrees, arc: AzimuthArc): boolean {
  return azimuth >= arc.start && azimuth < arc.end;
}
