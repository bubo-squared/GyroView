import { describe, expect, it } from 'vitest';

import {
  isWithinArc,
  NADIR_ARC,
  SEAM_BIN_COLUMNS,
  SEAM_BIN_COUNT,
  SEAM_STRIP_COLUMNS,
  SEAM_STRIP_ROWS,
  seamBinAzimuth,
  seamStripAzimuth,
  seamStripDirection,
  seamStripTheta,
} from './seamStrip';
import { degrees } from '../../shared/units/angle';

const NEARLY_ONE = 0.99;

describe('the seam strip', () => {
  it('samples the band from 83 to 97 degrees every half degree, in 72 bins of ten columns', () => {
    expect(SEAM_STRIP_ROWS).toBe(28);
    expect(SEAM_STRIP_COLUMNS).toBe(720);
    expect(SEAM_BIN_COLUMNS).toBe(10);
    expect(SEAM_BIN_COUNT).toBe(72);
    expect(seamStripTheta(0)).toBeCloseTo(83.25, 9);
    expect(seamStripTheta(SEAM_STRIP_ROWS - 1)).toBeCloseTo(96.75, 9);
    expect(seamStripAzimuth(0)).toBeCloseTo(0.25, 9);
    expect(seamBinAzimuth(0)).toBeCloseTo(2.5, 9);
    expect(seamBinAzimuth(SEAM_BIN_COUNT - 1)).toBeCloseTo(357.5, 9);
  });

  it('runs its azimuth from the right seam through the nadir, the left seam and the zenith', () => {
    const quarter = SEAM_STRIP_COLUMNS / 4;
    const ring = SEAM_STRIP_ROWS / 2;
    expect(seamStripDirection(0, ring)[0]).toBeGreaterThan(NEARLY_ONE);
    expect(seamStripDirection(quarter, ring)[1]).toBeGreaterThan(NEARLY_ONE);
    expect(seamStripDirection(2 * quarter, ring)[0]).toBeLessThan(-NEARLY_ONE);
    expect(seamStripDirection(3 * quarter, ring)[1]).toBeLessThan(-NEARLY_ONE);
  });

  it('leans its rows from just ahead of the ring to just behind it', () => {
    const ahead = seamStripDirection(0, 0)[2];
    const behind = seamStripDirection(0, SEAM_STRIP_ROWS - 1)[2];
    expect(ahead).toBeCloseTo(Math.cos((83.25 * Math.PI) / 180), 9);
    expect(behind).toBeCloseTo(Math.cos((96.75 * Math.PI) / 180), 9);
  });

  it('places the nadir arc under the camera, its end excluded', () => {
    expect(isWithinArc(degrees(90), NADIR_ARC)).toBe(true);
    expect(isWithinArc(degrees(60), NADIR_ARC)).toBe(true);
    expect(isWithinArc(degrees(120), NADIR_ARC)).toBe(false);
    expect(isWithinArc(degrees(2.5), NADIR_ARC)).toBe(false);
    expect(isWithinArc(degrees(270), NADIR_ARC)).toBe(false);
  });
});
