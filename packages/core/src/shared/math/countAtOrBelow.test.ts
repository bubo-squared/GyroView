import { describe, expect, it } from 'vitest';

import { countAtOrBelow } from './countAtOrBelow';

const SORTED = [1, 3, 3, 5, 8];

function countOf(target: number): number {
  return countAtOrBelow(SORTED.length, (index) => SORTED[index] ?? Infinity, target);
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
