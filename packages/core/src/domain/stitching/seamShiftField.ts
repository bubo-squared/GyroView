import type { SeamBinCosts } from './seamMismatch';
import { degrees, type Degrees } from '../../shared/units/angle';
import { SEAM_BIN_COUNT, seamBinAzimuth, type StripShift } from './seamStrip';

/**
 * The grid of shifts tried for every bin: every combination of slides along and across the
 * ring from `-extent` to `extent` in steps of `step`.
 */
export interface ShiftGrid {
  readonly extent: Degrees;
  readonly step: Degrees;
}

/**
 * Wide enough for the turn a factory calibration can be off by plus the parallax of an object
 * a metre away; fine enough that a bin's minimum lands within a twentieth of a degree after
 * the parabolic refinement.
 */
const GRID_EXTENT_DEGREES = 2;
const GRID_STEP_DEGREES = 0.1;
export const DEFAULT_SHIFT_GRID: ShiftGrid = {
  extent: degrees(GRID_EXTENT_DEGREES),
  step: degrees(GRID_STEP_DEGREES),
};

/**
 * The local shift that aligns the lenses in one bin, and how much the bin's costs trust it.
 */
export interface BinShift {
  readonly bin: number;
  readonly azimuth: Degrees;
  readonly shift: StripShift;
  /**
   * How much lower the best shift's cost is than the bin's typical cost, as a share of the
   * typical cost: near zero over sky or sea, where nothing tells one shift from another.
   */
  readonly contrast: number;
  /**
   * Whether the shift is worth fitting: both lenses image the bin, its costs have contrast,
   * and the minimum lies inside the grid.
   */
  readonly isConfident: boolean;
}

/**
 * A bin whose costs contrast less than this tells nothing about alignment.
 */
const MIN_CONTRAST = 0.2;
const MIN_VALIDITY = 0.9;
/**
 * The parabola through three points refines the minimum by up to half a step either way.
 */
const MAX_REFINEMENT_STEPS = 0.5;

/**
 * The grid's shifts in the order the costs come back: across the ring in the outer loop, along
 * it in the inner one.
 */
export function shiftGridOf(grid: ShiftGrid = DEFAULT_SHIFT_GRID): StripShift[] {
  const offsets = offsetsOf(grid);
  return offsets.flatMap((across) =>
    offsets.map((along) => ({ along: degrees(along), across: degrees(across) })),
  );
}

function offsetsOf(grid: ShiftGrid): number[] {
  const steps = Math.round(grid.extent / grid.step);
  return Array.from({ length: 2 * steps + 1 }, (_unused, index) => (index - steps) * grid.step);
}

/**
 * Each bin's aligning shift from the costs of every grid shift, `costsByShift[k][bin]` being
 * the cost of `shiftGridOf(grid)[k]` in that bin.
 */
export function localShiftsOf(
  costsByShift: readonly SeamBinCosts[],
  grid: ShiftGrid = DEFAULT_SHIFT_GRID,
): BinShift[] {
  const field: Field = { costsByShift, grid, side: offsetsOf(grid).length };
  return Array.from({ length: SEAM_BIN_COUNT }, (_unused, bin) => binShiftOf(bin, field));
}

/**
 * The costs of every grid shift in every bin, and the grid's side in shifts.
 */
interface Field {
  readonly costsByShift: readonly SeamBinCosts[];
  readonly grid: ShiftGrid;
  readonly side: number;
}

function binShiftOf(bin: number, { costsByShift, grid, side }: Field): BinShift {
  const costs = costsByShift.map((byBin) => byBin[bin]?.mismatch ?? Infinity);
  const validity = Math.min(...costsByShift.map((byBin) => byBin[bin]?.validity ?? 0));
  const best = indexOfMinimum(costs);
  const row = Math.floor(best / side);
  const column = best % side;
  const isInside = row > 0 && row < side - 1 && column > 0 && column < side - 1;
  const contrast = contrastOf(costs, best);
  const centre = -Math.floor(side / 2);
  const along = column + centre + (isInside ? refinement(costs, best, 1) : 0);
  const across = row + centre + (isInside ? refinement(costs, best, side) : 0);
  return {
    bin,
    azimuth: seamBinAzimuth(bin),
    shift: { along: degrees(along * grid.step), across: degrees(across * grid.step) },
    contrast,
    isConfident: validity >= MIN_VALIDITY && contrast >= MIN_CONTRAST && isInside,
  };
}

function indexOfMinimum(values: readonly number[]): number {
  let best = 0;
  for (const [index, value] of values.entries()) {
    if (value < (values[best] ?? Infinity)) best = index;
  }
  return best;
}

/**
 * How far below the median cost the minimum lies, as a share of the median.
 */
function contrastOf(costs: readonly number[], best: number): number {
  const finite = costs.filter((cost) => Number.isFinite(cost)).toSorted((a, b) => a - b);
  const median = finite[Math.floor(finite.length / 2)];
  const minimum = costs[best];
  const isMeasured = median !== undefined && minimum !== undefined && median > 0;
  return isMeasured ? (median - minimum) / median : 0;
}

/**
 * The sub-step offset of the minimum of the parabola through the best cost and its two
 * neighbours `stride` apart, in steps.
 */
function refinement(costs: readonly number[], best: number, stride: number): number {
  const before = costs[best - stride] ?? Infinity;
  const at = costs[best] ?? Infinity;
  const after = costs[best + stride] ?? Infinity;
  const curvature = before - 2 * at + after;
  if (!Number.isFinite(curvature) || curvature <= 0) return 0;
  const offset = (before - after) / (2 * curvature);
  return Math.max(-MAX_REFINEMENT_STEPS, Math.min(MAX_REFINEMENT_STEPS, offset));
}
