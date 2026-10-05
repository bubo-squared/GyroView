/**
 * How many of `count` values in ascending order, read through `valueAt`, are at or below
 * `target`: the index of the first value above it. Binary search, for long sorted columns.
 */
export function countAtOrBelow(
  count: number,
  valueAt: (index: number) => number,
  target: number,
): number {
  return countWhile(count, (index) => valueAt(index) <= target);
}

/**
 * How many of `count` values in ascending order, read through `valueAt`, are below `target`:
 * the index of the first value at or above it.
 */
export function countBelow(
  count: number,
  valueAt: (index: number) => number,
  target: number,
): number {
  return countWhile(count, (index) => valueAt(index) < target);
}

/**
 * The length of the run of leading indices that are in it, `isIn` being true for a prefix of the
 * indices and false after it.
 */
function countWhile(count: number, isIn: (index: number) => boolean): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (isIn(middle)) low = middle + 1;
    else high = middle;
  }
  return low;
}
