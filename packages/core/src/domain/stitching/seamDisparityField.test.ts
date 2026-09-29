import { describe, expect, it } from 'vitest';

import type { BinDisparity } from './seamDisparity';
import { disparityFieldOf, easedDisparities } from './seamDisparityField';
import { SEAM_BIN_COUNT, seamBinAzimuth } from './seamStrip';
import { degrees, type Degrees } from '../../shared/units/angle';
import { seconds } from '../../shared/units/time';

const NEAR = 4;
/**
 * The bins of the right seam (0 to 25 degrees) and of the left one (180 to 205).
 */
const RIGHT_SEAM = [0, 1, 2, 3, 4];
const LEFT_SEAM = [36, 37, 38, 39, 40];
/**
 * The first and the last bins of the arc under the camera, 60 to 120 degrees.
 */
const NADIR_START = 12;
const NADIR_END = 23;

function binsWith(trusted: ReadonlyMap<number, number>): BinDisparity[] {
  return Array.from({ length: SEAM_BIN_COUNT }, (_unused, bin) => ({
    bin,
    azimuth: seamBinAzimuth(bin),
    disparity: degrees(trusted.get(bin) ?? 0),
    contrast: trusted.has(bin) ? 1 : 0,
    isTrusted: trusted.has(bin),
  }));
}

function mapOf(bins: readonly number[], disparity: number): Map<number, number> {
  return new Map(bins.map((bin) => [bin, disparity]));
}

describe('disparityFieldOf', () => {
  it('keeps a trusted near object’s disparity over the bins it spans', () => {
    const field = disparityFieldOf(binsWith(mapOf(RIGHT_SEAM, NEAR)));
    expect(field).toHaveLength(SEAM_BIN_COUNT);
    expect(field[2]).toBeGreaterThan(0.8 * NEAR);
    expect(field[2]).toBeLessThanOrEqual(NEAR);
  });

  it('pulls toward zero where nothing is trusted: far, bare content shows no ghost there', () => {
    const field = disparityFieldOf(binsWith(mapOf(RIGHT_SEAM, NEAR)));
    for (const bin of LEFT_SEAM) expect(field[bin]).toBe(0);
    expect(field[RIGHT_SEAM.length + 1]).toBeLessThan(field[RIGHT_SEAM.length - 1] ?? 0);
  });

  it('smooths around the ring, across the start of the azimuths', () => {
    const field = disparityFieldOf(binsWith(mapOf([0], NEAR)));
    expect(field[SEAM_BIN_COUNT - 1]).toBeGreaterThan(0);
    expect(field[SEAM_BIN_COUNT - 1]).toBeCloseTo(field[1] ?? 0, 9);
  });

  it('never bends the seam under the camera, where whatever holds it is always near', () => {
    const beside = disparityFieldOf(binsWith(mapOf([NADIR_START - 2, NADIR_START - 1], NEAR)));
    expect(beside[NADIR_START]).toBe(0);
    const under = disparityFieldOf(binsWith(mapOf([NADIR_START, NADIR_START + 1], NEAR)));
    expect(under[NADIR_START - 1]).toBe(0);
    const after = disparityFieldOf(binsWith(mapOf([NADIR_END + 1, NADIR_END + 2], NEAR)));
    expect(after[NADIR_END]).toBe(0);
    const inside = disparityFieldOf(binsWith(mapOf([NADIR_END - 1, NADIR_END], NEAR)));
    expect(inside[NADIR_END + 1]).toBe(0);
  });

  it('is flat for a ring of untrusted bins', () => {
    const field = disparityFieldOf(binsWith(new Map()));
    expect(field.every((disparity) => disparity === 0)).toBe(true);
  });
});

describe('easedDisparities', () => {
  const previous: Degrees[] = Array.from({ length: SEAM_BIN_COUNT }, () => degrees(0));
  const target: Degrees[] = Array.from({ length: SEAM_BIN_COUNT }, () => degrees(NEAR));

  it('approaches the new field over time rather than jumping to it', () => {
    const eased = easedDisparities(previous, target, seconds(0.05));
    expect(eased[0]).toBeGreaterThan(0);
    expect(eased[0]).toBeLessThan(NEAR / 2);
  });

  it('reaches the new field after a long pause', () => {
    expect(easedDisparities(previous, target, seconds(10))[0]).toBeCloseTo(NEAR, 3);
  });

  it('takes the new field whole when there is no previous one', () => {
    expect(easedDisparities(undefined, target, seconds(0))).toEqual(target);
  });

  it('takes the new field whole after a step back in time, or an elapsed time that is not a number', () => {
    const partway = easedDisparities(previous, target, seconds(0.1));
    expect(easedDisparities(partway, target, seconds(-1))).toEqual(target);
    expect(easedDisparities(partway, target, seconds(NaN))).toEqual(target);
  });

  it('takes the new field whole when the one shown has another length', () => {
    expect(easedDisparities(previous.slice(1), target, seconds(0.05))).toEqual(target);
  });
});
