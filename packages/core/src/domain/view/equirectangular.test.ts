import { describe, expect, it } from 'vitest';

import { equirectangularPixelOf } from './equirectangular';

const SIZE = { width: 360, height: 180 };

describe('equirectangular mapping', () => {
  it('puts forward in the middle, right a quarter of the way in, up on the top row and down at the bottom', () => {
    expect(equirectangularPixelOf([0, 0, 1], SIZE)).toEqual({ column: 180, row: 90 });
    expect(equirectangularPixelOf([1, 0, 0], SIZE)).toEqual({ column: 270, row: 90 });
    expect(equirectangularPixelOf([0, -1, 0], SIZE)).toEqual({ column: 180, row: 0 });
    expect(equirectangularPixelOf([0, 1, 0], SIZE)).toEqual({ column: 180, row: 179 });
    expect(equirectangularPixelOf([0, 0, -1], SIZE).column).toBe(359);
  });

  it('accepts directions of any length and clamps the poles into the image', () => {
    expect(equirectangularPixelOf([0, 0, 5], SIZE)).toEqual({ column: 180, row: 90 });
    expect(equirectangularPixelOf([0, 2, 0], SIZE).row).toBe(179);
  });
});
