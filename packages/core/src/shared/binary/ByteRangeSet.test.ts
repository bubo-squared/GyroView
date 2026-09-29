import { describe, expect, it } from 'vitest';

import { ByteRange } from './ByteRange';
import { ByteRangeSet } from './ByteRangeSet';

function setOf(...spans: readonly (readonly [number, number])[]): ByteRangeSet {
  return ByteRangeSet.of(spans.map(([offset, end]) => ByteRange.of(offset, end - offset)));
}

function spansOf(set: ByteRangeSet): [number, number][] {
  return set.ranges.map((range) => [range.offset, range.end]);
}

describe('ByteRangeSet', () => {
  it('holds its ranges in order, overlapping and touching ones joined, empty ones left out', () => {
    const set = setOf([40, 50], [0, 10], [5, 20], [20, 30], [60, 60]);
    expect(spansOf(set)).toEqual([
      [0, 30],
      [40, 50],
    ]);
  });

  it('is empty with no ranges, or only empty ones', () => {
    expect(ByteRangeSet.empty.isEmpty).toBe(true);
    expect(setOf([7, 7]).isEmpty).toBe(true);
    expect(setOf([7, 8]).isEmpty).toBe(false);
  });

  it('counts the bytes it holds', () => {
    expect(setOf([0, 10], [5, 20], [40, 45]).totalLength).toBe(25);
  });

  it('joins two sets', () => {
    const joined = setOf([0, 10], [30, 40]).union(setOf([10, 15], [35, 50], [60, 70]));
    expect(spansOf(joined)).toEqual([
      [0, 15],
      [30, 50],
      [60, 70],
    ]);
  });

  it('takes away what another set holds, splitting a range around a hole in it', () => {
    const left = setOf([0, 100], [200, 300]).subtract(setOf([10, 20], [90, 210], [250, 400]));
    expect(spansOf(left)).toEqual([
      [0, 10],
      [20, 90],
      [210, 250],
    ]);
  });

  it('is unchanged by taking away ranges it does not reach', () => {
    const left = setOf([10, 20]).subtract(setOf([0, 10], [20, 30]));
    expect(spansOf(left)).toEqual([[10, 20]]);
  });

  it('covers a range only when one of its ranges holds all of it', () => {
    const set = setOf([0, 10], [20, 30]);
    expect(set.covers(ByteRange.of(2, 8))).toBe(true);
    expect(set.covers(ByteRange.of(20, 10))).toBe(true);
    expect(set.covers(ByteRange.of(5, 20))).toBe(false);
    expect(set.covers(ByteRange.of(9, 2))).toBe(false);
    expect(set.covers(ByteRange.of(30, 1))).toBe(false);
  });

  it('overlaps a range when any byte of it is in the set', () => {
    const set = setOf([0, 10], [20, 30]);
    expect(set.overlaps(ByteRange.of(9, 2))).toBe(true);
    expect(set.overlaps(ByteRange.of(25, 100))).toBe(true);
    expect(set.overlaps(ByteRange.of(10, 10))).toBe(false);
    expect(set.overlaps(ByteRange.of(30, 5))).toBe(false);
    expect(set.overlaps(ByteRange.of(5, 0))).toBe(false);
  });

  it('covers an empty range anywhere', () => {
    expect(ByteRangeSet.empty.covers(ByteRange.of(12, 0))).toBe(true);
  });

  it('bridges the gaps shorter than a length, and keeps the longer ones', () => {
    const bridged = setOf([0, 10], [14, 20], [30, 40], [44, 50]).bridgingGapsBelow(5);
    expect(spansOf(bridged)).toEqual([
      [0, 20],
      [30, 50],
    ]);
  });

  it('keeps a gap exactly as long as the length it bridges below', () => {
    expect(spansOf(setOf([0, 10], [15, 20]).bridgingGapsBelow(5))).toEqual([
      [0, 10],
      [15, 20],
    ]);
  });
});
