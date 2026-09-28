import { describe, expect, it } from 'vitest';

import { binDisparitiesOf, disparityCandidatesOf, type DisparityRange } from './seamDisparity';
import type { SeamBinCosts } from './seamMismatch';
import { SEAM_BIN_COUNT } from './seamStrip';
import { degrees } from '../../shared/units/angle';

const RANGE: DisparityRange = { least: degrees(-1), most: degrees(4), step: degrees(0.25) };
const CANDIDATE_COUNT = 21;
const FLOOR_COST = 0.01;
/**
 * The parabola through three candidates lands within a few hundredths of a degree of the true
 * minimum of a smooth bowl.
 */
const REFINED_TOLERANCE = 0.03;

/**
 * Costs over the range that rise as a bowl from `floor` in every bin, each bin imaged as
 * `validityAt` says for the candidate's disparity.
 */
function bowlCosts(
  floor: number,
  validityAt: (disparity: number) => number = () => 1,
): SeamBinCosts[] {
  return disparityCandidatesOf(RANGE).map(({ across }) =>
    Array.from({ length: SEAM_BIN_COUNT }, () => ({
      mismatch: FLOOR_COST + (across - floor) ** 2,
      validity: validityAt(across),
    })),
  );
}

function never(): number {
  return 0;
}

/**
 * Both lenses image all of the bin up to a disparity of two degrees, and a tenth beyond.
 */
function shrinkingBeyondTwo(disparity: number): number {
  return disparity > 2 ? 0.1 : 1;
}

describe('disparityCandidatesOf', () => {
  it('slides the sampling across the ring only, from the least disparity to the most', () => {
    const candidates = disparityCandidatesOf(RANGE);
    expect(candidates).toHaveLength(CANDIDATE_COUNT);
    expect(candidates[0]).toEqual({ along: 0, across: -1 });
    expect(candidates.at(-1)).toEqual({ along: 0, across: 4 });
    expect(candidates.every((candidate) => candidate.along === 0)).toBe(true);
  });
});

describe('binDisparitiesOf', () => {
  it('finds each bin’s disparity between the candidates, and trusts it', () => {
    const disparities = binDisparitiesOf(bowlCosts(1.63), RANGE);
    expect(disparities).toHaveLength(SEAM_BIN_COUNT);
    for (const bin of disparities) {
      expect(Math.abs(bin.disparity - 1.63)).toBeLessThan(REFINED_TOLERANCE);
      expect(bin.isTrusted).toBe(true);
    }
    expect(disparities[1]?.azimuth).toBeCloseTo(7.5, 9);
  });

  it('does not trust a bin whose costs are flat: sky or sea tell no disparity from another', () => {
    const flat = disparityCandidatesOf(RANGE).map(() =>
      Array.from({ length: SEAM_BIN_COUNT }, () => ({ mismatch: FLOOR_COST, validity: 1 })),
    );
    for (const bin of binDisparitiesOf(flat, RANGE)) {
      expect(bin.contrast).toBe(0);
      expect(bin.isTrusted).toBe(false);
    }
  });

  it('does not trust a minimum at either end of the range: the disparity lies beyond it', () => {
    expect(binDisparitiesOf(bowlCosts(6), RANGE)[0]?.isTrusted).toBe(false);
    expect(binDisparitiesOf(bowlCosts(-3), RANGE)[0]?.isTrusted).toBe(false);
  });

  it('leaves out a candidate the lenses image too little of, so its few directions cannot win', () => {
    const costs = bowlCosts(1, shrinkingBeyondTwo).map((byBin, index) =>
      disparityCandidatesOf(RANGE)[index]?.across === 3
        ? byBin.map((cost) => ({ ...cost, mismatch: 0 }))
        : byBin,
    );
    const [bin] = binDisparitiesOf(costs, RANGE);
    expect(Math.abs((bin?.disparity ?? 0) - 1)).toBeLessThan(REFINED_TOLERANCE);
    expect(bin?.isTrusted).toBe(true);
  });

  it('does not trust a bin the lenses do not both image at any disparity', () => {
    const unimaged = binDisparitiesOf(bowlCosts(1, never), RANGE);
    expect(unimaged.some((bin) => bin.isTrusted)).toBe(false);
  });
});
