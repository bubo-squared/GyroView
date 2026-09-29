import type { SeamBinCost, SeamBinCosts } from './seamMismatch';
import { SEAM_BIN_COUNT, seamBinAzimuth } from './seamStrip';
import { ensureInvariant } from '../../shared/errors/GyroViewError';
import { indexOfLeast, parabolicOffset } from '../../shared/math/minimum';
import { degrees, type Degrees } from '../../shared/units/angle';

/**
 * The disparities tried in every bin of the seam strip, as slides of lens 0's sampling across
 * the ring, away from its axis, from `least` to `most` in steps of `step`.
 *
 * The lenses sit on one axis, so a near object's two images differ only across the ring, and
 * always the same way: each lens sees the object farther from its own axis than the fixed
 * template, drawn for an infinitely far scene, expects. The disparity is how much farther lens 0
 * sees it than lens 1, in the angle from lens 0's axis. Far content has a disparity too, the
 * error of the lens models and poses at the seam, which may take either sign; the largest is
 * the overlap both lenses image.
 */
export interface DisparityRange {
  readonly least: Degrees;
  readonly most: Degrees;
  readonly step: Degrees;
}

/**
 * From well below the error the lens models leave at the seam (the legacy equidistant reading
 * draws far content 3.5 degrees too close together and more there on the office X5, 1.75 per
 * lens), so that a far bin's minimum is a trusted interior one, to beyond what the overlap leaves
 * room for: an object 20 centimetres from the camera, with lenses 3.2 centimetres apart. The
 * step is a quarter of a degree, refined by a parabola.
 */
const LEAST_DISPARITY_DEGREES = -6;
const MOST_DISPARITY_DEGREES = 10;
const DISPARITY_STEP_DEGREES = 0.25;

export const DEFAULT_DISPARITY_RANGE: DisparityRange = {
  least: degrees(LEAST_DISPARITY_DEGREES),
  most: degrees(MOST_DISPARITY_DEGREES),
  step: degrees(DISPARITY_STEP_DEGREES),
};

/**
 * The disparity measured in one bin, and whether its costs trust it.
 */
export interface BinDisparity {
  readonly bin: number;
  readonly azimuth: Degrees;
  readonly disparity: Degrees;
  /**
   * How much lower the best slide's cost is than the bin's typical cost, as a share of the
   * typical cost: near zero over sky, sea or a blank wall, where nothing tells one disparity
   * from another.
   */
  readonly contrast: number;
  /**
   * Whether the disparity may bend the seam: its costs have contrast, and their minimum lies
   * well inside the range, among slides both lenses image.
   */
  readonly isTrusted: boolean;
}

/**
 * The costs contrast less than this where the bin shows nothing to align.
 */
const MIN_CONTRAST = 0.2;
/**
 * A slide both lenses image less of the bin under than this is left out: the larger the
 * disparity, the fewer of the strip's rows both lenses see, and a few rows can agree by chance.
 */
const MIN_VALIDITY = 0.25;
/**
 * A minimum within this many steps of either end of the range, or of slides both lenses image
 * too little of, is not trusted: the cost may fall further beyond, and on thin repeating
 * lines (rigging, railings) a wrong alignment can win at the edge of what is compared.
 */
const EDGE_STEPS = 2;

/**
 * The slides of lens 0's sampling across the ring the range tries, in order.
 */
export function slidesOf(range: DisparityRange = DEFAULT_DISPARITY_RANGE): Degrees[] {
  const count = Math.round((range.most - range.least) / range.step) + 1;
  return Array.from({ length: count }, (_unused, index) =>
    degrees(range.least + index * range.step),
  );
}

/**
 * Each bin's disparity from the costs of every slide, `costsBySlide[k][bin]` being the cost of
 * `slidesOf(range)[k]` in that bin: a row per slide of the range, a cost per seam bin in each.
 */
export function binDisparitiesOf(
  costsBySlide: readonly SeamBinCosts[],
  range: DisparityRange = DEFAULT_DISPARITY_RANGE,
): BinDisparity[] {
  const slideCount = slidesOf(range).length;
  ensureInvariant(
    costsBySlide.length === slideCount,
    `${costsBySlide.length} rows of costs for ${slideCount} slides`,
  );
  ensureInvariant(
    costsBySlide.every((byBin) => byBin.length === SEAM_BIN_COUNT),
    `a row of costs without one per seam bin (${SEAM_BIN_COUNT})`,
  );
  return Array.from({ length: SEAM_BIN_COUNT }, (_unused, bin) => {
    const costs = costsBySlide.map((byBin) => usableCost(byBin[bin]));
    return binDisparityOf(bin, costs, range);
  });
}

function usableCost(cost: SeamBinCost | undefined): number {
  const isUsable = cost !== undefined && cost.validity >= MIN_VALIDITY;
  return isUsable && Number.isFinite(cost.mismatch) ? cost.mismatch : Infinity;
}

function binDisparityOf(
  bin: number,
  costs: readonly number[],
  range: DisparityRange,
): BinDisparity {
  const best = indexOfLeast(costs);
  const isInside = isUsableAround(costs, best);
  const contrast = contrastOf(costs, best);
  const steps = best + (isInside ? parabolicOffset(costs, best) : 0);
  return {
    bin,
    azimuth: seamBinAzimuth(bin),
    disparity: degrees(range.least + steps * range.step),
    contrast,
    isTrusted: isInside && contrast >= MIN_CONTRAST,
  };
}

function isUsableAround(costs: readonly number[], index: number): boolean {
  for (let offset = -EDGE_STEPS; offset <= EDGE_STEPS; offset += 1) {
    if (!Number.isFinite(costs[index + offset])) return false;
  }
  return true;
}

/**
 * How far below the median of the usable costs the minimum lies, as a share of the median.
 */
function contrastOf(costs: readonly number[], best: number): number {
  const usable = costs.filter((cost) => Number.isFinite(cost)).toSorted((a, b) => a - b);
  const median = usable[Math.floor(usable.length / 2)];
  const minimum = costs[best];
  const isMeasured = median !== undefined && minimum !== undefined && median > 0;
  return isMeasured ? (median - minimum) / median : 0;
}
