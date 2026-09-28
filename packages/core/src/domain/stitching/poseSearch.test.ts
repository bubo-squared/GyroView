import { describe, expect, it } from 'vitest';

import { DEFAULT_SEARCH_STAGES, gridAround, searchPose, type CostEvaluator } from './poseSearch';
import { ZERO_POSE_DELTA, type PoseDelta } from '../optics/poseDelta';
import { degrees } from '../../shared/units/angle';

const COARSE_CANDIDATES = 7 ** 3;
const FINE_CANDIDATES = 9 ** 3;
/**
 * The fine step is a tenth of a degree, so the best grid point lies within half of that of the
 * bowl's floor.
 */
const HALF_FINE_STEP = 0.05;
const FLAT_COST = 0.25;

function bowlAt(floor: PoseDelta): CostEvaluator {
  return (candidates) =>
    Promise.resolve(
      candidates.map(
        ({ yaw, pitch, roll }) =>
          (yaw - floor.yaw) ** 2 + (pitch - floor.pitch) ** 2 + (roll - floor.roll) ** 2,
      ),
    );
}

function expectNear(actual: PoseDelta, expected: PoseDelta): void {
  expect(Math.abs(actual.yaw - expected.yaw)).toBeLessThanOrEqual(HALF_FINE_STEP);
  expect(Math.abs(actual.pitch - expected.pitch)).toBeLessThanOrEqual(HALF_FINE_STEP);
  expect(Math.abs(actual.roll - expected.roll)).toBeLessThanOrEqual(HALF_FINE_STEP);
}

describe('searchPose', () => {
  it('finds the floor of a bowl inside its range to within half a fine step, in two grids', async () => {
    const floor = { yaw: degrees(0.7), pitch: degrees(-0.3), roll: degrees(1.1) };
    const result = await searchPose(bowlAt(floor));
    expectNear(result.best, floor);
    expect(result.evaluations).toBe(COARSE_CANDIDATES + FINE_CANDIDATES);
    expect(result.bestCost).toBeLessThan(result.factoryCost);
  });

  it('reports the factory pose as the best of a flat surface, and its cost', async () => {
    const flat: CostEvaluator = (candidates) => Promise.resolve(candidates.map(() => FLAT_COST));
    const result = await searchPose(flat);
    expect(result.best).toEqual(ZERO_POSE_DELTA);
    expect(result.factoryCost).toBe(FLAT_COST);
    expect(result.bestCost).toBe(FLAT_COST);
  });

  it('stops at the edge of its range for a floor beyond it', async () => {
    const beyond = { yaw: degrees(2.5), pitch: degrees(0), roll: degrees(0) };
    const result = await searchPose(bowlAt(beyond));
    expect(result.best.yaw).toBeCloseTo(1.9, 9);
  });

  it('ignores candidates that could not be measured', async () => {
    const floor = { yaw: degrees(0.5), pitch: degrees(0), roll: degrees(0) };
    const bowl = bowlAt(floor);
    const spoiled: CostEvaluator = async (candidates) => {
      const costs = await bowl(candidates);
      return costs.map((cost, index) => (index % 3 === 0 ? Infinity : cost));
    };
    const result = await searchPose(spoiled);
    expect(Number.isFinite(result.bestCost)).toBe(true);
    expect(Math.abs(result.best.yaw - floor.yaw)).toBeLessThanOrEqual(2 * HALF_FINE_STEP);
  });

  it('lays a stage’s grid around its centre with tidy degrees', () => {
    const [coarse] = DEFAULT_SEARCH_STAGES;
    if (!coarse) throw new Error('a coarse stage');
    const grid = gridAround({ yaw: degrees(0.1), pitch: degrees(0), roll: degrees(0) }, coarse);
    expect(grid).toHaveLength(COARSE_CANDIDATES);
    expect(grid[0]).toEqual({ yaw: -1.4, pitch: -1.5, roll: -1.5 });
    expect(grid.at(-1)).toEqual({ yaw: 1.6, pitch: 1.5, roll: 1.5 });
  });
});
