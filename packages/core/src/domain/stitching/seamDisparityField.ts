import type { BinDisparity } from './seamDisparity';
import { isWithinArc, NADIR_ARC } from './seamStrip';
import { degrees, type Degrees } from '../../shared/units/angle';
import { seconds, type Seconds } from '../../shared/units/time';

/**
 * The trusted disparities of neighbouring bins weigh in as a Gaussian of their distance, in
 * bins, as far as `REACH_BINS` either side, where the weight has fallen to about a seventh: a person a
 * metre away spans several 5-degree bins, and a bin between two trusted ones over a plain shirt
 * takes theirs.
 */
const SPREAD_BINS = 1;
const REACH_BINS = 2;
/**
 * The weight of zero in every bin's mean: a lone trusted bin keeps most of its disparity, and
 * a bin with no trusted neighbour keeps none, since far content shows no ghost unbent.
 */
const ZERO_PULL = 0.3;

/**
 * The disparity to bend the seam by in every bin, from the bins' measurements: the trusted
 * ones smoothed around the ring, pulled toward zero where few are trusted, and zero under the
 * camera, where whatever holds it is always within a metre and no bend would hide it.
 */
export function disparityFieldOf(bins: readonly BinDisparity[]): Degrees[] {
  const isCounted = bins.map((bin) => bin.isTrusted && !isWithinArc(bin.azimuth, NADIR_ARC));
  return bins.map((bin) => {
    if (isWithinArc(bin.azimuth, NADIR_ARC)) return degrees(0);
    let weightedSum = 0;
    let totalWeight = ZERO_PULL;
    for (let offset = -REACH_BINS; offset <= REACH_BINS; offset += 1) {
      const neighbour = (bin.bin + offset + bins.length) % bins.length;
      if (isCounted[neighbour] !== true) continue;
      weightedSum += neighbourWeight(offset) * (bins[neighbour]?.disparity ?? 0);
      totalWeight += neighbourWeight(offset);
    }
    return degrees(weightedSum / totalWeight);
  });
}

function neighbourWeight(offset: number): number {
  return Math.exp(-(offset ** 2) / (2 * SPREAD_BINS ** 2));
}

/**
 * How quickly a bent seam follows a new measurement: a person walking past moves a few degrees a
 * second, and a seam that jumps with every frame's noise looks worse than one that lags a little.
 */
const EASING_TIME_SECONDS = 0.25;
const EASING_TIME = seconds(EASING_TIME_SECONDS);

/**
 * The field shown next: the one shown before eased toward the new measurement over the time
 * since. The new one is taken whole when nothing was shown yet, when the field shown has another
 * length, or when the time since is not a forward step (a seek back, a loop).
 */
export function easedDisparities(
  previous: readonly Degrees[] | undefined,
  target: readonly Degrees[],
  elapsed: Seconds,
): Degrees[] {
  if (previous?.length !== target.length || !(elapsed >= 0)) return [...target];
  const share = 1 - Math.exp(-elapsed / EASING_TIME);
  return target.map((disparity, bin) => {
    const before = previous[bin] ?? disparity;
    return degrees(before + (disparity - before) * share);
  });
}
