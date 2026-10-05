import { describe, expect, it } from 'vitest';

import { countAtOrBelow, countBelow } from './countAtOrBelow';

const SORTED = [1, 3, 3, 5, 8];

function valueAt(index: number): number {
  return SORTED[index] ?? Infinity;
}

function countOf(target: number): number {
  return countAtOrBelow(SORTED.length, valueAt, target);
}

describe('countAtOrBelow', () => {
  it('counts the sorted values at or below a target', () => {
    expect(countOf(0)).toBe(0);
    expect(countOf(1)).toBe(1);
    expect(countOf(3)).toBe(3);
    expect(countOf(4)).toBe(3);
    expect(countOf(8)).toBe(5);
    expect(countOf(99)).toBe(5);
  });

  it('counts none of no values', () => {
    expect(countAtOrBelow(0, () => 0, 5)).toBe(0);
  });
});

describe('countBelow', () => {
  it('counts the sorted values below a target: the index of the first at or above it', () => {
    expect(countBelow(SORTED.length, valueAt, 0)).toBe(0);
    expect(countBelow(SORTED.length, valueAt, 1)).toBe(0);
    expect(countBelow(SORTED.length, valueAt, 3)).toBe(1);
    expect(countBelow(SORTED.length, valueAt, 4)).toBe(3);
    expect(countBelow(SORTED.length, valueAt, 99)).toBe(5);
  });
});
