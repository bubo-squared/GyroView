import { describe, expect, it } from 'vitest';

import { colourStatisticsOf } from './colourStatistics';

const SIZE = { width: 8, height: 4 };

function panorama(colourOfRow: (row: number) => readonly number[]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(SIZE.width * SIZE.height * 4);
  for (let row = 0; row < SIZE.height; row += 1) {
    for (let column = 0; column < SIZE.width; column += 1) {
      pixels.set([...colourOfRow(row), 255], (row * SIZE.width + column) * 4);
    }
  }
  return pixels;
}

describe('colourStatisticsOf', () => {
  it('tells the mean, the saturation and the luma of a uniform panorama', () => {
    const statistics = colourStatisticsOf(
      panorama(() => [200, 100, 50]),
      SIZE,
    );
    const [red, green, blue] = statistics.meanRgb;
    expect([red, green, blue].map((mean) => Math.round(mean * 1e9) / 1e9)).toEqual([200, 100, 50]);
    expect(statistics.saturation).toBe(150);
    for (const luma of statistics.lumaPercentiles) expect(luma).toBeCloseTo(117.65, 2);
  });

  it('weighs a row by the area it covers, the poles least', () => {
    // The rows sampled are the first and third: the polar one white, the equatorial one black.
    const statistics = colourStatisticsOf(
      panorama((row) => (row === 0 ? [255, 255, 255] : [0, 0, 0])),
      SIZE,
    );
    const polarWeight = Math.cos((0.5 / 4 - 0.5) * Math.PI);
    const equatorialWeight = Math.cos((2.5 / 4 - 0.5) * Math.PI);
    const mean = (255 * polarWeight) / (polarWeight + equatorialWeight);
    expect(statistics.meanRgb[0]).toBeCloseTo(mean, 6);
    expect(statistics.lumaPercentiles[1]).toBe(0);
  });
});
