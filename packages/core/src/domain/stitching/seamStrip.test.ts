import { describe, expect, it } from 'vitest';

import {
  isWithinArc,
  NADIR_ARC,
  SEAM_BIN_COLUMNS,
  SEAM_BIN_COUNT,
  SEAM_STRIP_ROWS,
  SEAM_STRIP_THETA_START,
  seamBinAzimuth,
} from './seamStrip';
import { degrees } from '../../shared/units/angle';

describe('the seam strip', () => {
  it('samples the band from 83 to 97 degrees every half degree, in 72 bins of ten columns', () => {
    expect(SEAM_STRIP_THETA_START).toBe(83);
    expect(SEAM_STRIP_ROWS).toBe(28);
    expect(SEAM_BIN_COLUMNS).toBe(10);
    expect(SEAM_BIN_COUNT).toBe(72);
    expect(seamBinAzimuth(0)).toBeCloseTo(2.5, 9);
    expect(seamBinAzimuth(SEAM_BIN_COUNT - 1)).toBeCloseTo(357.5, 9);
  });

  it('places the nadir arc under the camera, its end excluded', () => {
    expect(isWithinArc(degrees(90), NADIR_ARC)).toBe(true);
    expect(isWithinArc(degrees(60), NADIR_ARC)).toBe(true);
    expect(isWithinArc(degrees(120), NADIR_ARC)).toBe(false);
    expect(isWithinArc(degrees(2.5), NADIR_ARC)).toBe(false);
    expect(isWithinArc(degrees(270), NADIR_ARC)).toBe(false);
  });
});
