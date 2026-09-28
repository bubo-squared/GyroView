import type { BinShift } from './seamShiftField';
import type { PoseDelta } from '../optics/poseDelta';
import { degrees, degreesToRadians, type Degrees } from '../../shared/units/angle';

/**
 * What the shift field says about the back lens: the turn beyond its calibration, and what
 * the turn cannot explain.
 */
export interface PoseFit {
  readonly delta: PoseDelta;
  /**
   * The slide across the ring shared by every azimuth: a radial scale error, or the parallax
   * of a scene that is near all around; a turn produces none of it.
   */
  readonly symmetric: Degrees;
  /**
   * The root mean square of what the fit leaves unexplained, over the bins it kept.
   */
  readonly residual: Degrees;
  readonly binsUsed: number;
}

/**
 * Fewer confident bins than this cannot tell a turn from the scene.
 */
const MIN_BINS = 12;
/**
 * Bins whose residual exceeds this many times the median residual are dropped and the fit
 * repeated: the near objects the turn cannot explain.
 */
const OUTLIER_FACTOR = 3;
const REFIT_ROUNDS = 3;

interface AcrossModel {
  readonly cosine: number;
  readonly sine: number;
  readonly constant: number;
}

/**
 * The turn of the lens that best explains the confident bins' shifts. Along the ring the
 * shift is the roll, at every azimuth alike; across it, a yaw shows as `cos φ` and a pitch as
 * `-sin φ`, both changing sign between the two side seams, while a scale error or the scene's
 * parallax adds the same at every azimuth. The fit is repeated without the bins it explains
 * worst, so a near object at one seam does not steer it.
 */
export function fitPoseToShifts(shifts: readonly BinShift[]): PoseFit | undefined {
  let kept = shifts.filter((shift) => shift.isConfident);
  let fit = fitOnce(kept);
  for (let round = 0; fit && round < REFIT_ROUNDS; round += 1) {
    const inliers = withoutOutliers(kept, fit);
    if (inliers.length === kept.length) break;
    kept = inliers;
    fit = fitOnce(kept);
  }
  return fit;
}

function fitOnce(kept: readonly BinShift[]): PoseFit | undefined {
  if (kept.length < MIN_BINS) return undefined;
  const across = fitAcross(kept);
  const roll = meanOf(kept.map((shift) => shift.shift.along));
  const delta = { yaw: degrees(across.cosine), pitch: degrees(-across.sine), roll: degrees(roll) };
  return {
    delta,
    symmetric: degrees(across.constant),
    residual: degrees(residualOf(kept, delta, across.constant)),
    binsUsed: kept.length,
  };
}

/**
 * Least squares of `across = cosine·cos φ + sine·sin φ + constant` over the bins, solved
 * through the normal equations of the three unknowns.
 */
function fitAcross(kept: readonly BinShift[]): AcrossModel {
  const rows = kept.map((shift) => {
    const azimuth = degreesToRadians(shift.azimuth);
    return { c: Math.cos(azimuth), s: Math.sin(azimuth), y: shift.shift.across };
  });
  const sum = (term: (row: (typeof rows)[number]) => number): number =>
    rows.reduce((total, row) => total + term(row), 0);
  const normal = [
    [sum((r) => r.c * r.c), sum((r) => r.c * r.s), sum((r) => r.c)],
    [sum((r) => r.c * r.s), sum((r) => r.s * r.s), sum((r) => r.s)],
    [sum((r) => r.c), sum((r) => r.s), rows.length],
  ];
  const right = [sum((r) => r.c * r.y), sum((r) => r.s * r.y), sum((r) => r.y)];
  const [cosine, sine, constant] = solve3(normal, right);
  return { cosine, sine, constant };
}

/**
 * Cramer's rule on a 3x3 system; a singular system (all bins at one azimuth) fits nothing.
 */
function solve3(m: readonly (readonly number[])[], b: readonly number[]): [number, number, number] {
  const det = determinant3(m);
  if (Math.abs(det) < Number.EPSILON) return [0, 0, 0];
  const column = (index: number): number[][] =>
    m.map((row, r) => row.map((value, c) => (c === index ? (b[r] ?? 0) : value)));
  return [
    determinant3(column(0)) / det,
    determinant3(column(1)) / det,
    determinant3(column(2)) / det,
  ];
}

function determinant3(m: readonly (readonly number[])[]): number {
  const at = (r: number, c: number): number => m[r]?.[c] ?? 0;
  return (
    at(0, 0) * (at(1, 1) * at(2, 2) - at(1, 2) * at(2, 1)) -
    at(0, 1) * (at(1, 0) * at(2, 2) - at(1, 2) * at(2, 0)) +
    at(0, 2) * (at(1, 0) * at(2, 1) - at(1, 1) * at(2, 0))
  );
}

function predictedAcross(delta: PoseDelta, constant: number, azimuth: Degrees): number {
  const angle = degreesToRadians(azimuth);
  return delta.yaw * Math.cos(angle) - delta.pitch * Math.sin(angle) + constant;
}

function residualsOf(kept: readonly BinShift[], delta: PoseDelta, constant: number): number[] {
  return kept.map((shift) =>
    Math.hypot(
      shift.shift.along - delta.roll,
      shift.shift.across - predictedAcross(delta, constant, shift.azimuth),
    ),
  );
}

function residualOf(kept: readonly BinShift[], delta: PoseDelta, constant: number): number {
  const residuals = residualsOf(kept, delta, constant);
  return Math.sqrt(meanOf(residuals.map((value) => value * value)));
}

function withoutOutliers(kept: readonly BinShift[], fit: PoseFit): BinShift[] {
  const residuals = residualsOf(kept, fit.delta, fit.symmetric);
  const sorted = residuals.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const limit = OUTLIER_FACTOR * Math.max(median, Number.EPSILON);
  return kept.filter((_shift, index) => (residuals[index] ?? Infinity) <= limit);
}

function meanOf(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return values.length > 0 ? total / values.length : 0;
}
