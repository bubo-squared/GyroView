import { ByteRange } from './ByteRange';

/**
 * A set of bytes held as disjoint ranges in order, with overlapping and touching ones joined:
 * the bytes a download holds, has asked for, or still needs. Immutable; every operation answers
 * with a new set.
 */
export class ByteRangeSet {
  public static readonly empty = new ByteRangeSet([]);

  private constructor(public readonly ranges: readonly ByteRange[]) {}

  public static of(ranges: readonly ByteRange[]): ByteRangeSet {
    const ordered = ranges
      .filter((range) => range.length > 0)
      .toSorted((left, right) => left.offset - right.offset);
    return new ByteRangeSet(joined(ordered, 0));
  }

  public get isEmpty(): boolean {
    return this.ranges.length === 0;
  }

  public get totalLength(): number {
    return this.ranges.reduce((total, range) => total + range.length, 0);
  }

  public union(other: ByteRangeSet): ByteRangeSet {
    return ByteRangeSet.of([...this.ranges, ...other.ranges]);
  }

  public subtract(other: ByteRangeSet): ByteRangeSet {
    return new ByteRangeSet(this.ranges.flatMap((range) => withoutAny(range, other.ranges)));
  }

  /**
   * Whether every byte of `range` is in the set; an empty range always is.
   */
  public covers(range: ByteRange): boolean {
    return (
      range.length === 0 ||
      this.ranges.some((held) => held.offset <= range.offset && range.end <= held.end)
    );
  }

  /**
   * Whether any byte of `range` is in the set; an empty range never is.
   */
  public overlaps(range: ByteRange): boolean {
    return (
      range.length > 0 &&
      this.ranges.some((held) => held.offset < range.end && range.offset < held.end)
    );
  }

  /**
   * The set with every gap between two of its ranges shorter than `length` filled: fetching a
   * few unneeded bytes costs less than asking for the ranges on either side apart.
   */
  public bridgingGapsBelow(length: number): ByteRangeSet {
    return new ByteRangeSet(joined(this.ranges, length));
  }
}

/**
 * Ranges in order, each joined with the next when the gap between them is shorter than
 * `bridgedGap` (or when they overlap or touch, for a gap of zero).
 */
function joined(ordered: readonly ByteRange[], bridgedGap: number): ByteRange[] {
  const result: ByteRange[] = [];
  for (const range of ordered) {
    const last = result.at(-1);
    const isJoined = last !== undefined && range.offset - last.end < Math.max(bridgedGap, 1);
    if (last && isJoined) result[result.length - 1] = spanning(last.offset, range.end, last.end);
    else result.push(range);
  }
  return result;
}

/**
 * `range` with every byte of `holes` taken out, in pieces in order.
 */
function withoutAny(range: ByteRange, holes: readonly ByteRange[]): ByteRange[] {
  const pieces: ByteRange[] = [];
  let start = range.offset;
  for (const hole of holes) {
    if (hole.end <= start || hole.offset >= range.end) continue;
    if (hole.offset > start) pieces.push(ByteRange.of(start, hole.offset - start));
    start = Math.max(start, hole.end);
  }
  if (start < range.end) pieces.push(ByteRange.of(start, range.end - start));
  return pieces;
}

/**
 * The range from `offset` to the further of two ends.
 */
function spanning(offset: number, end: number, otherEnd: number): ByteRange {
  return ByteRange.of(offset, Math.max(end, otherEnd) - offset);
}
