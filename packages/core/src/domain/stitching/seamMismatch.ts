/**
 * How the two lenses disagree over one azimuth bin of the seam strip: the mean absolute luma
 * difference (0..1) over the bin's directions both lenses image, each capped at
 * {@link MISMATCH_CAP}; and the share of the bin's directions both lenses image.
 */
export interface SeamBinCost {
  readonly mismatch: number;
  readonly validity: number;
}

/**
 * One cost per bin, in bin order around the ring.
 */
export type SeamBinCosts = readonly SeamBinCost[];

/**
 * The luma difference (0..1) beyond which two lenses disagree about content, torn by parallax or
 * a near object, rather than about alignment: a direction counts as this much and no more, so
 * no single torn object can own a bin. A quarter of the range.
 */
const CAP_LEVELS = 64;
const CHANNEL_LEVELS = 255;
export const MISMATCH_CAP = CAP_LEVELS / CHANNEL_LEVELS;
