import { degrees } from '../../shared/units/angle';

/**
 * The seam ring: the body directions 90 degrees from body +z, lens 0's nominal axis, halfway
 * between the two lenses' axes. The feather band is laid out about it, and so are the seam
 * strip and the bent join that measure and bend the seam.
 */
const SEAM_RING_DEGREES = 90;
export const SEAM_RING_ANGLE = degrees(SEAM_RING_DEGREES);
