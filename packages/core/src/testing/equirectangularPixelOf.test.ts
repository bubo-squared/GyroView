import { describe, expect, it } from 'vitest';

import { equirectangularDirectionOf, equirectangularPixelOf } from './equirectangularPixelOf';

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

  it('turns a pixel back into the direction through its centre', () => {
    for (const pixel of [
      { column: 0, row: 0 },
      { column: 180, row: 90 },
      { column: 359, row: 179 },
      { column: 91, row: 33 },
    ]) {
      expect(equirectangularPixelOf(equirectangularDirectionOf(pixel, SIZE), SIZE)).toEqual(pixel);
    }
    const [x, y, z] = equirectangularDirectionOf({ column: 180, row: 90 }, SIZE);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
  });
});
