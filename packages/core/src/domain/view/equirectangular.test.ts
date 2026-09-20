import { describe, expect, it } from 'vitest';

import { equirectangularDirectionOf, equirectangularPixelOf } from './equirectangular';
import type { Vector3 } from '../../shared/math/Vector3';

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

  it('inverts itself through the pixel centres', () => {
    for (const direction of [
      [0.3, -0.5, 0.8],
      [-0.9, 0.1, 0.2],
      [0.1, 0.9, -0.4],
    ] as Vector3[]) {
      const pixel = equirectangularPixelOf(direction, SIZE);
      const back = equirectangularDirectionOf(pixel, SIZE);
      const length = Math.hypot(...direction);
      for (const [index, component] of direction.entries()) {
        expect(back[index]).toBeCloseTo(component / length, 1);
      }
    }
  });
});
