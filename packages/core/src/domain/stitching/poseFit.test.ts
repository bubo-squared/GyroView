import { describe, expect, it } from 'vitest';

import { fitPoseToShifts } from './poseFit';
import type { BinShift } from './seamShiftField';
import { SEAM_BIN_COUNT, seamBinAzimuth, type StripShift } from './seamStrip';
import { degrees, degreesToRadians, type Degrees } from '../../shared/units/angle';

const TOLERANCE = 0.02;
const NEAR_OBJECT_BINS = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
const NEAR_OBJECT_SHIFT = 1.5;

/**
 * A field of one shift per bin, as a function of the bin's azimuth.
 */
function fieldOf(
  shiftAt: (azimuth: Degrees) => StripShift,
  isConfident: (bin: number) => boolean = () => true,
): BinShift[] {
  return Array.from({ length: SEAM_BIN_COUNT }, (_unused, bin) => ({
    bin,
    azimuth: seamBinAzimuth(bin),
    shift: shiftAt(seamBinAzimuth(bin)),
    contrast: 1,
    isConfident: isConfident(bin),
  }));
}

interface Turn {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
}

function turnField({ yaw, pitch, roll }: Turn, symmetric = 0): BinShift[] {
  return fieldOf((azimuth) => {
    const angle = degreesToRadians(azimuth);
    return {
      along: degrees(roll),
      across: degrees(yaw * Math.cos(angle) - pitch * Math.sin(angle) + symmetric),
    };
  });
}

function expectFit(field: readonly BinShift[], expected: [number, number, number, number]): void {
  const fit = fitPoseToShifts(field);
  if (!fit) throw new Error('no fit');
  const [yaw, pitch, roll, symmetric] = expected;
  expect(Math.abs(fit.delta.yaw - yaw)).toBeLessThan(TOLERANCE);
  expect(Math.abs(fit.delta.pitch - pitch)).toBeLessThan(TOLERANCE);
  expect(Math.abs(fit.delta.roll - roll)).toBeLessThan(TOLERANCE);
  expect(Math.abs(fit.symmetric - symmetric)).toBeLessThan(TOLERANCE);
}

describe('fitPoseToShifts', () => {
  it('reads a slide along the ring, alike everywhere, as a roll', () => {
    expectFit(turnField({ yaw: 0, pitch: 0, roll: 0.7 }), [0, 0, 0.7, 0]);
  });

  it('reads a slide across the ring that changes sign between the seams as a yaw or a pitch', () => {
    expectFit(turnField({ yaw: 0.5, pitch: 0, roll: 0 }), [0.5, 0, 0, 0]);
    expectFit(turnField({ yaw: 0, pitch: 0.4, roll: 0 }), [0, 0.4, 0, 0]);
  });

  it('reads a slide across the ring that is the same at every azimuth as no turn at all', () => {
    expectFit(turnField({ yaw: 0, pitch: 0, roll: 0 }, 0.8), [0, 0, 0, 0.8]);
  });

  it('separates a turn from the scene’s parallax, and drops the bins a near object owns', () => {
    const field = turnField({ yaw: 0.5, pitch: -0.4, roll: 0.7 }, 0.3).map((shift) =>
      NEAR_OBJECT_BINS.has(shift.bin)
        ? {
            ...shift,
            shift: {
              along: degrees(shift.shift.along + NEAR_OBJECT_SHIFT),
              across: degrees(shift.shift.across + NEAR_OBJECT_SHIFT),
            },
          }
        : shift,
    );
    expectFit(field, [0.5, -0.4, 0.7, 0.3]);
    expect(fitPoseToShifts(field)?.binsUsed).toBe(SEAM_BIN_COUNT - NEAR_OBJECT_BINS.size);
  });

  it('fits only the bins that are trusted, and nothing from too few of them', () => {
    const garbage = { along: degrees(9), across: degrees(-9) };
    const half = fieldOf(
      (azimuth) => (azimuth < 180 ? { along: degrees(0.7), across: degrees(0) } : garbage),
      (bin) => seamBinAzimuth(bin) < 180,
    );
    expectFit(half, [0, 0, 0.7, 0]);
    const few = fieldOf(
      () => ({ along: degrees(0.7), across: degrees(0) }),
      (bin) => bin < 5,
    );
    expect(fitPoseToShifts(few)).toBeUndefined();
  });
});
