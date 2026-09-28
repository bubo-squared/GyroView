import { SEAM_BIN_COUNT } from './seamStrip';
import { degrees, type Degrees } from '../../shared/units/angle';

/**
 * How the stitch joins the lenses at the seam:
 * - `fixed`: the calibration's template, every direction read where an infinitely far scene
 *   would be, blended across the feather band;
 * - `bent`: each lens's image moved across the seam by half the disparity measured there, so
 *   that a near object's two images meet, up to {@link SEAM_MAX_BEND}; what is left beyond
 *   narrows the blend to a clean cut instead of a double image.
 */
export type SeamJoin = 'fixed' | 'bent';

/**
 * The join and the disparity it works with in every bin of the seam ring, in bin order.
 */
export interface SeamAlignment {
  readonly join: SeamJoin;
  readonly disparities: readonly Degrees[];
}

export const FIXED_SEAM: SeamAlignment = {
  join: 'fixed',
  disparities: Array.from({ length: SEAM_BIN_COUNT }, () => degrees(0)),
};

/**
 * How far from the seam, on each side, a bent lens's image is moved: the bend falls smoothly
 * to nothing over this span, so content beyond it is drawn as the template draws it. Wide
 * enough that a bend of a few degrees stretches the lens's image by a tenth at most.
 */
const BEND_WIDTH_DEGREES = 15;
export const SEAM_BEND_WIDTH = degrees(BEND_WIDTH_DEGREES);

/**
 * The most a bent join moves the lenses' images apart or together: at the seam each lens is
 * then read 92 degrees from its axis, well inside the image circle's 96, where it still images
 * sharply and bright.
 */
const MAX_BEND_DEGREES = 4;
export const SEAM_MAX_BEND = degrees(MAX_BEND_DEGREES);

/**
 * Beyond the most a bent join bends, the blend narrows from the feather band to this half width
 * as the rest of the disparity grows to {@link SEAM_CUT_DISPARITY}: a degree still hides the step
 * in exposure between the lenses, and a double image farther apart than three degrees reads as
 * two objects.
 */
const CUT_HALF_WIDTH_DEGREES = 1;
const CUT_DISPARITY_DEGREES = 3;
export const SEAM_CUT_HALF_WIDTH = degrees(CUT_HALF_WIDTH_DEGREES);
export const SEAM_CUT_DISPARITY = degrees(CUT_DISPARITY_DEGREES);
