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
  return disparityCandidatesOf(RANGE).map((disparity) =>
    Array.from({ length: SEAM_BIN_COUNT }, () => ({
      mismatch: FLOOR_COST + (disparity - floor) ** 2,
      validity: validityAt(disparity),
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
  it('slides the sampling from the least disparity to the most, a step apart', () => {
    const candidates = disparityCandidatesOf(RANGE);
    expect(candidates).toHaveLength(CANDIDATE_COUNT);
    expect(candidates[0]).toBe(-1);
    expect(candidates[1]).toBe(-0.75);
    expect(candidates.at(-1)).toBe(4);
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
      disparityCandidatesOf(RANGE)[index] === 3
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

  it('does not trust a minimum too shallow to tell one disparity from another', () => {
    const shallow = disparityCandidatesOf(RANGE).map((disparity) =>
      Array.from({ length: SEAM_BIN_COUNT }, () => ({
        mismatch: 1 + 0.001 * (disparity - 1.5) ** 2,
        validity: 1,
      })),
    );
    const [bin] = binDisparitiesOf(shallow, RANGE);
    expect(bin?.contrast).toBeLessThan(0.01);
    expect(bin?.isTrusted).toBe(false);
  });

  it('never lets a cost that is not a number win', () => {
    const costs = bowlCosts(1.5).map((byBin, index) =>
      index === 0 ? byBin.map((cost) => ({ ...cost, mismatch: NaN })) : byBin,
    );
    const [bin] = binDisparitiesOf(costs, RANGE);
    expect(Math.abs((bin?.disparity ?? 0) - 1.5)).toBeLessThan(REFINED_TOLERANCE);
  });

  it('refuses costs measured for another range of candidates', () => {
    expect(() => binDisparitiesOf(bowlCosts(1).slice(1), RANGE)).toThrow(
      expect.objectContaining({ code: 'invariant-violation' }),
    );
    expect(() => binDisparitiesOf([], RANGE)).toThrow(
      expect.objectContaining({ code: 'invariant-violation' }),
    );
  });
});
