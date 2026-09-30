import { describe, expect, it } from 'vitest';

import type { LensModel } from './LensModel';
import { parseOffsetString } from '../format/calibration/parseOffsetString';
import type { Vector3 } from '../../shared/math/Vector3';
import { OFFICE_CALIBRATION } from '../../../test/support/officeCalibration';

const mei = parseOffsetString(OFFICE_CALIBRATION.offsetV3).lenses;
const extendedMei = parseOffsetString(OFFICE_CALIBRATION.offsetV6).lenses;
const polynomial = parseOffsetString(OFFICE_CALIBRATION.offsetV2).lenses;
const equidistant = parseOffsetString(OFFICE_CALIBRATION.offset).lenses;

/**
 * Back-lens projections computed independently from the MEI formulas (python, 2026-09-18) for
 * directions with both tangential terms active; they pin the distortion model's sign conventions.
 */
const BACK_LENS_GOLDEN = [
  { theta: 60, azimuth: 30, x: 9427.1557, y: 3456.3014 },
  { theta: 85, azimuth: 200, x: 5950.8268, y: 1904.193 },
  { theta: 30, azimuth: 90, x: 8082.1831, y: 3432.3644 },
];

function directionAt(thetaDegrees: number, azimuthDegrees = 0): Vector3 {
  const theta = (thetaDegrees * Math.PI) / 180;
  const azimuth = (azimuthDegrees * Math.PI) / 180;
  return [
    Math.sin(theta) * Math.cos(azimuth),
    Math.sin(theta) * Math.sin(azimuth),
    Math.cos(theta),
  ];
}

function radiusOf(model: LensModel, thetaDegrees: number): number {
  const point = model.project(directionAt(thetaDegrees));
  if (!point) throw new Error(`direction at ${thetaDegrees} degrees is outside the lens`);
  return Math.hypot(point.x - model.principalPoint.x, point.y - model.principalPoint.y);
}

function worstRadialDifference(candidate: LensModel, reference: LensModel): number {
  let worst = 0;
  for (let theta = 0; theta <= 100; theta += 1) {
    worst = Math.max(worst, Math.abs(radiusOf(candidate, theta) - radiusOf(reference, theta)));
  }
  return worst;
}

describe('lens models on the X5 office lenses', () => {
  it('map the optical axis to the principal point', () => {
    for (const lens of [...mei, ...polynomial, ...equidistant]) {
      expect(lens.model.project([0, 0, 1])).toEqual(lens.model.principalPoint);
    }
  });

  it('place the legacy radius 96 degrees from the axis, where the MEI model reaches it only at 100', () => {
    expect(radiusOf(equidistant[0]!.model, 96)).toBeCloseTo(2664.255, 6);
    expect(radiusOf(equidistant[1]!.model, 96)).toBeCloseTo(2652.858, 6);
    // The MEI projection adds tangential distortion of ~2 px on top of its radius.
    expect(Math.abs(radiusOf(mei[0]!.model, 100) - 2664.255)).toBeLessThan(2.5);
    expect(Math.abs(radiusOf(mei[1]!.model, 100) - 2652.858)).toBeLessThan(2.5);
  });

  it('project off-axis directions along the image radius', () => {
    const point = mei[0]!.model.project(directionAt(45, 90));
    expect(point!.x).toBeCloseTo(mei[0]!.model.principalPoint.x, 0);
    expect(point!.y).toBeGreaterThan(mei[0]!.model.principalPoint.y + 1000);
  });

  it('refuse directions beyond the field of view', () => {
    for (const lens of [...mei, ...polynomial, ...equidistant]) {
      expect(lens.model.project(directionAt(101))).toBeUndefined();
      expect(lens.model.project([0, 0, -1])).toBeUndefined();
    }
  });

  it('the v6 reading images every angle within 2 px of the radius v3 does (ADR 0032)', () => {
    expect(worstRadialDifference(extendedMei[0]!.model, mei[0]!.model)).toBeLessThan(2);
    expect(worstRadialDifference(extendedMei[1]!.model, mei[1]!.model)).toBeLessThan(2);
  });

  it('polynomial model reproduces the MEI model within 10 px across the field', () => {
    expect(worstRadialDifference(polynomial[0]!.model, mei[0]!.model)).toBeLessThan(10);
    expect(worstRadialDifference(polynomial[1]!.model, mei[1]!.model)).toBeLessThan(10);
  });

  it('equidistant reading draws every direction further out than the MEI model: a tenth mid-field, 3 percent at the edge (ADR 0023)', () => {
    for (const lensIndex of [0, 1]) {
      const ratioAt = (theta: number): number =>
        radiusOf(equidistant[lensIndex]!.model, theta) / radiusOf(mei[lensIndex]!.model, theta);
      expect(ratioAt(30)).toBeGreaterThan(1.08);
      expect(ratioAt(30)).toBeLessThan(1.12);
      expect(ratioAt(90)).toBeGreaterThan(1.02);
      expect(ratioAt(90)).toBeLessThan(1.05);
    }
  });

  it.each(BACK_LENS_GOLDEN)(
    'MEI projects theta $theta at azimuth $azimuth to the golden pixel ($x, $y) including tangential distortion',
    ({ theta, azimuth, x, y }) => {
      const point = mei[1]!.model.project(directionAt(theta, azimuth));
      expect(point?.x).toBeCloseTo(x, 3);
      expect(point?.y).toBeCloseTo(y, 3);
    },
  );

  it('MEI radius grows monotonically with the angle', () => {
    let previous = -1;
    for (let theta = 0; theta <= 100; theta += 5) {
      const radius = radiusOf(mei[0]!.model, theta);
      expect(radius).toBeGreaterThan(previous);
      previous = radius;
    }
  });
});
