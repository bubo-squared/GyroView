import { degrees, type Degrees } from '../../shared/units/angle';

/**
 * The seam ring: the body directions 90 degrees from body +z, lens 0's nominal axis, halfway
 * between the two lenses' axes. The feather band, the seam strip and the bent join are all laid
 * out about it.
 */
const SEAM_RING_DEGREES = 90;
export const SEAM_RING_ANGLE = degrees(SEAM_RING_DEGREES);

/**
 * An arc of azimuths around the seam ring: from `start` up to `end`, in degrees from body +x
 * towards body +y (down).
 */
export interface AzimuthArc {
  readonly start: Degrees;
  readonly end: Degrees;
}

/**
 * The seam strip: the band of body directions 83 to 97 degrees from body +z, where both lenses
 * see the same scene and their agreement is measured. It is sampled every half degree in
 * azimuth and in the angle from body +z, and read in 5-degree azimuth bins.
 *
 * Azimuth runs from body +x (the right seam) towards body +y (down): 0 right, 90 nadir, 180
 * left, 270 zenith. The strip reaches 7 degrees either side of the ring; a slide of one lens's
 * sampling moves the directions it reads, and the share of each bin both lenses still image
 * (its validity) says how much of a slide the strip holds.
 */
const STRIP_HALF_WIDTH_DEGREES = 7;
const STRIP_STEP_DEGREES = 0.5;
const BIN_WIDTH_DEGREES = 5;
const FULL_CIRCLE_DEGREES = 360;
/**
 * A cell is sampled at its centre.
 */
const CELL_CENTRE = 0.5;

export const SEAM_STRIP_THETA_START = degrees(SEAM_RING_DEGREES - STRIP_HALF_WIDTH_DEGREES);
export const SEAM_STRIP_STEP = degrees(STRIP_STEP_DEGREES);
export const SEAM_BIN_WIDTH = degrees(BIN_WIDTH_DEGREES);

export const SEAM_STRIP_ROWS = Math.round((2 * STRIP_HALF_WIDTH_DEGREES) / STRIP_STEP_DEGREES);
export const SEAM_BIN_COLUMNS = Math.round(BIN_WIDTH_DEGREES / STRIP_STEP_DEGREES);
export const SEAM_BIN_COUNT = Math.round(FULL_CIRCLE_DEGREES / BIN_WIDTH_DEGREES);
/**
 * Each cell's disagreement is the mean over this many sub-samples along each side of it, so
 * the cost sees the source's own texture rather than one point every seven pixels: a fifth of
 * the step is a tenth of a degree, about 1.4 pixels of a 5.7K frame and 1.9 of an 8K one.
 */
export const SEAM_CELL_SUBSAMPLES = 5;

/**
 * The arc under the camera, where whatever holds it (a hand, a stick, a deck) is always within a
 * metre and its parallax dwarfs anything else: the disparity field stays flat there.
 */
const NADIR_ARC_START_DEGREES = 60;
const NADIR_ARC_END_DEGREES = 120;
export const NADIR_ARC: AzimuthArc = {
  start: degrees(NADIR_ARC_START_DEGREES),
  end: degrees(NADIR_ARC_END_DEGREES),
};

/**
 * The azimuth at the centre of a bin.
 */
export function seamBinAzimuth(bin: number): Degrees {
  return degrees((bin + CELL_CENTRE) * SEAM_BIN_WIDTH);
}

export function isWithinArc(azimuth: Degrees, arc: AzimuthArc): boolean {
  return azimuth >= arc.start && azimuth < arc.end;
}
