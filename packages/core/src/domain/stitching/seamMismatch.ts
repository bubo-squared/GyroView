import { isWithinArc, NADIR_ARC, seamBinAzimuth, type AzimuthArc } from './seamStrip';

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
 * How the bins are folded into one cost.
 */
export interface SeamCostRule {
  /**
   * Bins whose azimuth falls in this arc are left out, whatever they show.
   */
  readonly excludedArc: AzimuthArc | undefined;
  /**
   * A bin imaged by both lenses over less of itself than this is left out.
   */
  readonly minBinValidity: number;
  /**
   * The share of the counted bins, the worst ones, left out of the mean: a near person torn
   * across one seam spans a few bins and must not steer the whole ring.
   */
  readonly trimmedFraction: number;
  /**
   * Fewer counted bins than this leave the cost undefined.
   */
  readonly minBins: number;
}

const MIN_BIN_VALIDITY = 0.9;
const TRIMMED_BIN_FRACTION = 0.25;
const MIN_BINS = 24;

export const DEFAULT_SEAM_COST_RULE: SeamCostRule = {
  excludedArc: NADIR_ARC,
  minBinValidity: MIN_BIN_VALIDITY,
  trimmedFraction: TRIMMED_BIN_FRACTION,
  minBins: MIN_BINS,
};

/**
 * The seam's cost: the trimmed mean of the counted bins' mismatches, or undefined when too few
 * bins count.
 */
export function seamCostOf(
  bins: SeamBinCosts,
  rule: SeamCostRule = DEFAULT_SEAM_COST_RULE,
): number | undefined {
  const counted = bins
    .filter((bin, index) => isCounted(bin, index, rule))
    .map((bin) => bin.mismatch)
    .toSorted((a, b) => a - b);
  if (counted.length < rule.minBins) return undefined;
  const kept = counted.slice(0, Math.ceil(counted.length * (1 - rule.trimmedFraction)));
  return meanOf(kept);
}

function isCounted(bin: SeamBinCost, index: number, rule: SeamCostRule): boolean {
  const isExcluded =
    rule.excludedArc !== undefined && isWithinArc(seamBinAzimuth(index), rule.excludedArc);
  return bin.validity >= rule.minBinValidity && !isExcluded;
}

function meanOf(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}
