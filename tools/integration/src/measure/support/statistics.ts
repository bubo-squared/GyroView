const QUARTER = 0.25;
const HALF = 0.5;
const THREE_QUARTERS = 0.75;

/**
 * The mean of the values, NaN for none.
 */
export function meanOf(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * The value at fraction `at` of the sorted values, between neighbours linearly.
 */
function quantileOf(sorted: readonly number[], at: number): number {
  const position = at * (sorted.length - 1);
  const below = sorted[Math.floor(position)] ?? NaN;
  const above = sorted[Math.ceil(position)] ?? below;
  return below + (above - below) * (position - Math.floor(position));
}

export interface Quartiles {
  readonly lower: number;
  readonly median: number;
  readonly upper: number;
}

/**
 * The median and quartiles: a few values spoiled by near objects move neither.
 */
export function quartilesOf(values: readonly number[]): Quartiles {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    lower: quantileOf(sorted, QUARTER),
    median: quantileOf(sorted, HALF),
    upper: quantileOf(sorted, THREE_QUARTERS),
  };
}
