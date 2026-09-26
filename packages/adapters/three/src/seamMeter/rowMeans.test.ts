import { describe, expect, it } from 'vitest';

import { rowMeansOf } from './rowMeans';

describe('rowMeansOf', () => {
  it('averages the imaged texels of each row and ignores the rest', () => {
    const pixels = Uint8Array.from([
      // row 0: two imaged texels (255 and 51 red), one not imaged
      255, 0, 0, 255, 51, 0, 0, 255, 9, 9, 9, 0,
      // row 1: one imaged texel of mid grey
      128, 128, 128, 255, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const means = rowMeansOf(pixels, 3, 2);
    expect(means?.[0]?.[0]).toBeCloseTo(0.6, 6);
    expect(means?.[0]?.[1]).toBe(0);
    expect(means?.[1]).toEqual([128 / 255, 128 / 255, 128 / 255]);
  });

  it('gives up when a row images nothing', () => {
    const pixels = Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(rowMeansOf(pixels, 1, 2)).toBeUndefined();
  });
});
