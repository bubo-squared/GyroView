import { describe, expect, it } from 'vitest';

import type { LensModel } from './LensModel';
import { OffsetStringParser } from './OffsetStringParser';
import type { Vector3 } from '../../shared/math/Vector3';
import { OFFICE_CALIBRATION } from '../../../test/support/officeCalibration';

const parser = new OffsetStringParser();
const mei = parser.parse(OFFICE_CALIBRATION.offsetV3).lenses;
const polynomial = parser.parse(OFFICE_CALIBRATION.offsetV2).lenses;
const equidistant = parser.parse(OFFICE_CALIBRATION.offset).lenses;

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

  it('agree with the legacy radius at the 100-degree field edge to within a few pixels', () => {
    // The legacy radius is radial only; the MEI projection adds tangential distortion of ~2 px.
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

  it('polynomial model reproduces the MEI model within 10 px across the field', () => {
    expect(worstRadialDifference(polynomial[0]!.model, mei[0]!.model)).toBeLessThan(10);
    expect(worstRadialDifference(polynomial[1]!.model, mei[1]!.model)).toBeLessThan(10);
  });

  it('equidistant fallback stays within 55 px of the MEI model across the field', () => {
    expect(worstRadialDifference(equidistant[0]!.model, mei[0]!.model)).toBeLessThan(55);
    expect(worstRadialDifference(equidistant[1]!.model, mei[1]!.model)).toBeLessThan(55);
  });

  it('MEI radius grows monotonically with the angle', () => {
    let previous = -1;
    for (let theta = 0; theta <= 100; theta += 5) {
      const radius = radiusOf(mei[0]!.model, theta);
      expect(radius).toBeGreaterThan(previous);
      previous = radius;
    }
  });
});
