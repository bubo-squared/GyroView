/**
 * The index of the least of the values, the first on a tie; values that are not finite never
 * win, so a list of them all gives index 0.
 */
export function indexOfLeast(values: readonly number[]): number {
  let best = 0;
  let least = Infinity;
  for (const [index, value] of values.entries()) {
    if (!(value < least)) continue;
    best = index;
    least = value;
  }
  return best;
}

/**
 * Where the parabola through the values at `index` and its two neighbours has its vertex, in
 * steps from `index`: nothing when a neighbour is missing or not finite, or the three do not bend
 * upwards; at most half a step either way, where the neighbours sit.
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
 * The best sample's neighbours bound the vertex of a parabola through three samples that bends
 * upwards to half a step either way.
 */
const HALF_STEP = 0.5;
