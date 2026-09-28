import { describe, expect, it } from 'vitest';

import { DEFAULT_SEAM_COST_RULE, seamCostOf, type SeamBinCost } from './seamMismatch';
import { isWithinArc, NADIR_ARC, SEAM_BIN_COUNT, seamBinAzimuth } from './seamStrip';

const LOW = 0.1;
const HIGH = 1;

function bins(mismatch: (bin: number) => number, validity = 1): SeamBinCost[] {
  return Array.from({ length: SEAM_BIN_COUNT }, (_unused, bin) => ({
    mismatch: mismatch(bin),
    validity,
  }));
}

function isUnderTheCamera(bin: number): boolean {
  return isWithinArc(seamBinAzimuth(bin), NADIR_ARC);
}

describe('seamCostOf', () => {
  it('is the bins’ mismatch when they all agree', () => {
    expect(seamCostOf(bins(() => LOW))).toBeCloseTo(LOW, 9);
  });

  it('leaves out the bins under the camera, whatever they show', () => {
    expect(seamCostOf(bins((bin) => (isUnderTheCamera(bin) ? HIGH : LOW)))).toBeCloseTo(LOW, 9);
  });

  it('trims the worst quarter of the counted bins, so a torn object at one seam does not steer it', () => {
    const torn = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seamCostOf(bins((bin) => (torn.has(bin) ? HIGH : LOW)))).toBeCloseTo(LOW, 9);
  });

  it('counts a bin only where both lenses image most of it', () => {
    const halfSeen = bins(() => 0, 0.5);
    const seen = bins(() => LOW);
    expect(seamCostOf(halfSeen)).toBeUndefined();
    expect(seamCostOf(seen)).toBeCloseTo(LOW, 9);
  });

  it('is undefined with fewer counted bins than the rule asks for', () => {
    const few = bins(() => LOW).map((bin, index) =>
      index < DEFAULT_SEAM_COST_RULE.minBins ? bin : { ...bin, validity: 0 },
    );
    expect(seamCostOf(few)).toBeUndefined();
    expect(seamCostOf(few, { ...DEFAULT_SEAM_COST_RULE, excludedArc: undefined })).toBeCloseTo(
      LOW,
      9,
    );
  });
});
