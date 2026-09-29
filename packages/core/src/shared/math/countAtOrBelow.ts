/**
 * How many of `count` values in ascending order, read through `valueAt`, are at or below
 * `target`: the index of the first value above it. Binary search, for long sorted columns.
 */
export function countAtOrBelow(
  count: number,
  valueAt: (index: number) => number,
  target: number,
): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (valueAt(middle) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}
