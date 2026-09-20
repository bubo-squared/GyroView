import { describe, expect, it } from 'vitest';

import { crossProduct, dotProduct, isFiniteVector, magnitudeOf } from './Vector3';

describe('Vector3', () => {
  it('follows the right-hand rule and measures lengths', () => {
    expect(crossProduct([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(crossProduct([0, 1, 0], [0, 0, 1])).toEqual([1, 0, 0]);
    expect(crossProduct([2, 3, 4], [5, 6, 7])).toEqual([-3, 6, -3]);
    expect(dotProduct([1, 2, 3], [4, -5, 6])).toBe(12);
    expect(magnitudeOf([3, 4, 12])).toBe(13);
  });

  it('tells finite vectors from broken ones', () => {
    expect(isFiniteVector([0, -1, 2.5])).toBe(true);
    expect(isFiniteVector([0, NaN, 0])).toBe(false);
    expect(isFiniteVector([Infinity, 0, 0])).toBe(false);
  });
});
