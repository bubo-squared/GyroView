import {
  isZeroDelta,
  largestComponentOf,
  ZERO_POSE_DELTA,
  type PoseDelta,
} from '../optics/poseDelta';
import { ensureInvariant } from '../../shared/errors/GyroViewError';
import { degrees, type Degrees } from '../../shared/units/angle';

/**
 * One stage of the search: every combination of turns from `-extent` to `extent` in steps of
 * `step` about each axis, around the stage's centre.
 */
export interface SearchStage {
  readonly extent: Degrees;
  readonly step: Degrees;
}

/**
 * Source: omnikit's `_refine_rear_extrinsics`, which found the rear lens's pose this way: a
 * coarse grid over the range a factory calibration can be off by, then a fine grid around its
 * best. 343 then 729 candidates.
 */
const COARSE_EXTENT_DEGREES = 1.5;
const COARSE_STEP_DEGREES = 0.5;
const FINE_EXTENT_DEGREES = 0.4;
const FINE_STEP_DEGREES = 0.1;

export const DEFAULT_SEARCH_STAGES: readonly SearchStage[] = [
  { extent: degrees(COARSE_EXTENT_DEGREES), step: degrees(COARSE_STEP_DEGREES) },
  { extent: degrees(FINE_EXTENT_DEGREES), step: degrees(FINE_STEP_DEGREES) },
];

/**
 * The cost of each candidate, in candidate order; a candidate that could not be measured costs
 * infinity.
 */
export type CostEvaluator = (candidates: readonly PoseDelta[]) => Promise<readonly number[]>;

export interface PoseSearchResult {
  readonly best: PoseDelta;
  readonly bestCost: number;
  /**
   * The cost of the factory pose itself, the zero delta, measured in the first stage.
   */
  readonly factoryCost: number;
  readonly evaluations: number;
}

interface Evaluated {
  readonly delta: PoseDelta;
  readonly cost: number;
}

/**
 * Deltas are kept to a millionth of a degree, so a grid built by stepping reads as it was meant.
 */
const DELTA_RESOLUTION = 1e6;

/**
 * Finds the delta with the least cost, stage by stage, each stage's grid around the best so
 * far. The factory pose is always among the first stage's candidates; a tie goes to the
 * smaller turn.
 */
export async function searchPose(
  evaluate: CostEvaluator,
  stages: readonly SearchStage[] = DEFAULT_SEARCH_STAGES,
): Promise<PoseSearchResult> {
  let best: Evaluated = { delta: ZERO_POSE_DELTA, cost: Infinity };
  let factoryCost = Infinity;
  let evaluations = 0;
  for (const [index, stage] of stages.entries()) {
    const candidates =
      index === 0 ? withFactory(gridAround(best.delta, stage)) : gridAround(best.delta, stage);
    const costs = await evaluate(candidates);
    ensureInvariant(costs.length === candidates.length, 'one cost per candidate');
    evaluations += candidates.length;
    if (index === 0) {
      factoryCost = costs[candidates.findIndex((candidate) => isZeroDelta(candidate))] ?? Infinity;
    }
    best = bestOf(candidates, costs, best);
  }
  return { best: best.delta, bestCost: best.cost, factoryCost, evaluations };
}

/**
 * The stage's grid of deltas around `centre`.
 */
export function gridAround(centre: PoseDelta, stage: SearchStage): PoseDelta[] {
  const offsets = offsetsOf(stage);
  return offsets.flatMap((yaw) =>
    offsets.flatMap((pitch) =>
      offsets.map((roll) => ({
        yaw: tidy(centre.yaw + yaw),
        pitch: tidy(centre.pitch + pitch),
        roll: tidy(centre.roll + roll),
      })),
    ),
  );
}

function offsetsOf(stage: SearchStage): number[] {
  const steps = Math.round(stage.extent / stage.step);
  return Array.from({ length: 2 * steps + 1 }, (_unused, index) => (index - steps) * stage.step);
}

function tidy(value: number): Degrees {
  return degrees(Math.round(value * DELTA_RESOLUTION) / DELTA_RESOLUTION);
}

function withFactory(candidates: PoseDelta[]): PoseDelta[] {
  const hasFactory = candidates.some((candidate) => isZeroDelta(candidate));
  return hasFactory ? candidates : [ZERO_POSE_DELTA, ...candidates];
}

function bestOf(
  candidates: readonly PoseDelta[],
  costs: readonly number[],
  sofar: Evaluated,
): Evaluated {
  let best = sofar;
  for (const [index, delta] of candidates.entries()) {
    const cost = costs[index] ?? Infinity;
    if (
      cost < best.cost ||
      (cost === best.cost && largestComponentOf(delta) < largestComponentOf(best.delta))
    ) {
      best = { delta, cost };
    }
  }
  return best;
}
