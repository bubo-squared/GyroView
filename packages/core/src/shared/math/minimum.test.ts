import { describe, expect, it } from 'vitest';

import { indexOfLeast, parabolicOffset } from './minimum';

describe('indexOfLeast', () => {
  it('finds the least value, the first on a tie', () => {
    expect(indexOfLeast([3, 1, 2, 1])).toBe(1);
  });

  it('never picks a value that is not finite', () => {
    expect(indexOfLeast([NaN, 2, Infinity, 1])).toBe(3);
    expect(indexOfLeast([1, -Infinity, 0])).toBe(2);
    expect(indexOfLeast([NaN, NaN])).toBe(0);
  });
});

describe('parabolicOffset', () => {
  it('puts the vertex of a parabola sampled at whole steps between them', () => {
    const samples = [0, 1, 2, 3].map((x) => (x - 2.3) ** 2);
    expect(parabolicOffset(samples, 2)).toBeCloseTo(0.3, 9);
  });

  it('gives nothing at an end, beside a value that is not finite, or where the values do not bend upwards', () => {
    expect(parabolicOffset([1, 2, 3], 0)).toBe(0);
    expect(parabolicOffset([Infinity, 1, 2], 1)).toBe(0);
    expect(parabolicOffset([1, 2, 1], 1)).toBe(0);
  });

  it('stays within half a step of an index that is not the least', () => {
    expect(parabolicOffset([0, 1, 3], 1)).toBe(-0.5);
  });
});
