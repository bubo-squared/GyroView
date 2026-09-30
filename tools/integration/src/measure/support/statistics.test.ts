import { describe, expect, it } from 'vitest';

import { harmonicsOf, type AzimuthSample } from './statistics';

const PRECISION = 9;

/**
 * A value around the seam, every ten degrees: a mean, once a turn and twice a turn, each with
 * its own phase.
 */
function sampled(mean: number, once: number, twice: number): AzimuthSample[] {
  return Array.from({ length: 36 }, (_unused, index) => {
    const azimuth = index * 10;
    const radians = (azimuth * Math.PI) / 180;
    return {
      azimuth,
      value: mean + once * Math.cos(radians - 0.4) + twice * Math.sin(2 * radians + 1.1),
    };
  });
}

describe('harmonicsOf', () => {
  it('recovers the amplitudes once and twice a turn, whatever their phase and the mean', () => {
    const harmonics = harmonicsOf(sampled(3, 0.7, 0.25));
    expect(harmonics.once).toBeCloseTo(0.7, PRECISION);
    expect(harmonics.twice).toBeCloseTo(0.25, PRECISION);
  });

  it('finds no harmonic in a value the same at every azimuth, as a wrong radial scale leaves', () => {
    const harmonics = harmonicsOf(sampled(-1.5, 0, 0));
    expect(harmonics.once).toBeCloseTo(0, PRECISION);
    expect(harmonics.twice).toBeCloseTo(0, PRECISION);
  });

  it('fits nothing with fewer samples than terms', () => {
    expect(harmonicsOf(sampled(1, 1, 1).slice(0, 4))).toEqual({ once: NaN, twice: NaN });
  });
});
