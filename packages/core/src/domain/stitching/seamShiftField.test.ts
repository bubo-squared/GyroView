import { describe, expect, it } from 'vitest';

import type { SeamBinCosts } from './seamMismatch';
import { localShiftsOf, shiftGridOf, type ShiftGrid } from './seamShiftField';
import { SEAM_BIN_COUNT, type StripShift } from './seamStrip';
import { degrees } from '../../shared/units/angle';

const GRID: ShiftGrid = { extent: degrees(1), step: degrees(0.1) };
const GRID_SIDE = 21;
const FLOOR_COST = 0.01;
/**
 * The parabola through three grid points lands within a few hundredths of a degree of the
 * true minimum of a smooth bowl.
 */
const REFINED_TOLERANCE = 0.03;

/**
 * Costs over the grid that rise as a bowl from `floor`, alike in every bin.
 */
function bowlCosts(floor: StripShift, validity = 1): SeamBinCosts[] {
  return shiftGridOf(GRID).map((shift) => {
    const mismatch =
      FLOOR_COST + (shift.along - floor.along) ** 2 + (shift.across - floor.across) ** 2;
    return Array.from({ length: SEAM_BIN_COUNT }, () => ({ mismatch, validity }));
  });
}

describe('shiftGridOf', () => {
  it('lays the shifts out across the ring in the outer loop and along it in the inner one', () => {
    const grid = shiftGridOf(GRID);
    expect(grid).toHaveLength(GRID_SIDE * GRID_SIDE);
    expect(grid[0]).toEqual({ along: -1, across: -1 });
    expect(grid[GRID_SIDE - 1]).toEqual({ along: 1, across: -1 });
    expect(grid[GRID_SIDE]?.across).toBeCloseTo(-0.9, 9);
    expect(grid.at(-1)).toEqual({ along: 1, across: 1 });
  });
});

describe('localShiftsOf', () => {
  it('finds each bin’s aligning shift between the grid points, and trusts it', () => {
    const floor = { along: degrees(0.35), across: degrees(-0.62) };
    const shifts = localShiftsOf(bowlCosts(floor), GRID);
    expect(shifts).toHaveLength(SEAM_BIN_COUNT);
    for (const bin of shifts) {
      expect(Math.abs(bin.shift.along - floor.along)).toBeLessThan(REFINED_TOLERANCE);
      expect(Math.abs(bin.shift.across - floor.across)).toBeLessThan(REFINED_TOLERANCE);
      expect(bin.isConfident).toBe(true);
      expect(bin.contrast).toBeGreaterThan(0.5);
    }
    expect(shifts[0]?.azimuth).toBeCloseTo(2.5, 9);
  });

  it('does not trust a bin whose costs are flat: sky or sea tell no shift from another', () => {
    const flat = shiftGridOf(GRID).map(() =>
      Array.from({ length: SEAM_BIN_COUNT }, () => ({ mismatch: FLOOR_COST, validity: 1 })),
    );
    for (const bin of localShiftsOf(flat, GRID)) {
      expect(bin.contrast).toBe(0);
      expect(bin.isConfident).toBe(false);
    }
  });

  it('does not trust a minimum on the edge of the grid, nor a bin a lens does not image', () => {
    const beyond = { along: degrees(1), across: degrees(0) };
    const onTheEdge = localShiftsOf(bowlCosts(beyond), GRID);
    for (const bin of onTheEdge) expect(bin.isConfident).toBe(false);
    const inside = { along: degrees(0.2), across: degrees(0.1) };
    const halfImaged = localShiftsOf(bowlCosts(inside, 0.5), GRID);
    for (const bin of halfImaged) expect(bin.isConfident).toBe(false);
  });
});
