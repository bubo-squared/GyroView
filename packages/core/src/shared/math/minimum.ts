/**
 * The index of the least of the values, the first on a tie; values that are not finite never
 * win, so a list of them all gives index 0.
 */
export function indexOfLeast(values: readonly number[]): number {
  let best = 0;
  let least = Infinity;
  for (const [index, value] of values.entries()) {
    if (!Number.isFinite(value) || !(value < least)) continue;
    best = index;
    least = value;
  }
  return best;
}

/**
 * Where the parabola through the values at `index` and its two neighbours has its vertex, in
 * steps from `index`: nothing when a neighbour is missing or not finite, or the three do not bend
 * upwards; clamped to half a step either way, the most it can be when the value at `index` is the
 * least of the three.
 */
export function parabolicOffset(values: readonly number[], index: number): number {
  const before = values[index - 1] ?? Infinity;
  const at = values[index] ?? Infinity;
  const after = values[index + 1] ?? Infinity;
  const curvature = before - 2 * at + after;
  if (!Number.isFinite(curvature) || curvature <= 0) return 0;
  const offset = (before - after) / (2 * curvature);
  return Math.max(-HALF_STEP, Math.min(HALF_STEP, offset));
}

/**
 * Past half a step the vertex lies nearer a neighbour than `index`, which then was not the least.
 */
const HALF_STEP = 0.5;
