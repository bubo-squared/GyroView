import { describe, expect, it } from 'vitest';

import {
  addVectors,
  crossProduct,
  dotProduct,
  interpolateVectors,
  isFiniteVector,
  magnitudeOf,
  scaleVector,
  subtractVectors,
  ZERO_VECTOR3,
} from './Vector3';

describe('Vector3', () => {
  it('adds, subtracts and scales component by component', () => {
    expect(addVectors([1, 2, 3], [10, 20, 30])).toEqual([11, 22, 33]);
    expect(subtractVectors([10, 20, 30], [1, 2, 3])).toEqual([9, 18, 27]);
    expect(scaleVector([1, -2, 3], 2)).toEqual([2, -4, 6]);
    expect(addVectors(ZERO_VECTOR3, [4, 5, 6])).toEqual([4, 5, 6]);
  });

  it('interpolates from the first vector at 0 to the second at 1', () => {
    expect(interpolateVectors([0, 0, 0], [2, 4, 6], 0)).toEqual([0, 0, 0]);
    expect(interpolateVectors([0, 0, 0], [2, 4, 6], 0.5)).toEqual([1, 2, 3]);
    expect(interpolateVectors([0, 0, 0], [2, 4, 6], 1)).toEqual([2, 4, 6]);
  });

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
