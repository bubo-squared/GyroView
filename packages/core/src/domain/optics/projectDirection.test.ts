import { describe, expect, it } from 'vitest';

import { EquidistantModel } from './EquidistantModel';
import type { LensProjectionParameters } from './LensModel';
import { HALF_FIELD_OF_VIEW } from './opticsConstants';
import type { PixelPoint } from './PixelPoint';
import { projectDirection } from './projectDirection';
import { PolynomialModel } from './PolynomialModel';
import { scaledProjection } from './scaledProjection';
import { parseOffsetString } from '../format/calibration/parseOffsetString';
import type { Vector3 } from '../../shared/math/Vector3';
import {
  degrees,
  degreesToRadians,
  radians,
  radiansToDegrees,
  type Radians,
} from '../../shared/units/angle';
import { OFFICE_CALIBRATION } from '../../../test/support/officeCalibration';

const ANGLES_DEGREES = [0, 5, 30, 60, 85, 98];
const AZIMUTHS_DEGREES = [0, 45, 130, 250];
const SCALE = 1.008;

function directionAt(angleDegrees: number, azimuthDegrees = 0): Vector3 {
  const theta = (angleDegrees * Math.PI) / 180;
  const phi = (azimuthDegrees * Math.PI) / 180;
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
}

const CENTRE: PixelPoint = { x: 1500, y: 1400 };

function radiusOf(projection: LensProjectionParameters, angle: Radians): number {
  const point = projected(projection, directionAt(radiansToDegrees(angle)));
  return Math.hypot(point.x - projection.principalPoint.x, point.y - projection.principalPoint.y);
}

function projected(projection: LensProjectionParameters, direction: Vector3): PixelPoint {
  const point = projectDirection({ projection, halfFieldOfView: HALF_FIELD_OF_VIEW }, direction);
  if (!point) throw new Error('the direction is outside the lens');
  return point;
}

/**
 * Holds a projection drawn at a radial scale to the projection itself, every pixel `scale` times
 * as far from the principal point: what the stitching setup's radial scale draws.
 */
function expectScaledAboutThePrincipalPoint(projection: LensProjectionParameters): void {
  const scaled = scaledProjection(projection, SCALE);
  const centre = projection.principalPoint;
  for (const angle of ANGLES_DEGREES) {
    for (const azimuth of AZIMUTHS_DEGREES) {
      const direction = directionAt(angle, azimuth);
      const point = projected(projection, direction);
      const drawn = projected(scaled, direction);
      expect(drawn.x - centre.x).toBeCloseTo(SCALE * (point.x - centre.x), 6);
      expect(drawn.y - centre.y).toBeCloseTo(SCALE * (point.y - centre.y), 6);
    }
  }
}

describe('projectDirection', () => {
  it('draws a Mei lens at a radial scale every pixel that much further out', () => {
    for (const lens of parseOffsetString(OFFICE_CALIBRATION.offsetV3).lenses) {
      expect(lens.model.projection.kind).toBe('mei');
      expectScaledAboutThePrincipalPoint(lens.model.projection);
    }
  });

  it('draws a radial polynomial at a radial scale every pixel that much further out', () => {
    for (const lens of parseOffsetString(OFFICE_CALIBRATION.offsetV2).lenses) {
      expect(lens.model.projection.kind).toBe('radial-polynomial');
      expectScaledAboutThePrincipalPoint(lens.model.projection);
    }
  });

  it("folds the polynomial model's scale into coefficients that reach the edge radius at the field edge", () => {
    const model = new PolynomialModel({
      edgeRadius: 1000,
      principalPoint: CENTRE,
      coefficients: [1, 0.1, -0.02, 0.003],
    });
    expect(radiusOf(model.projection, HALF_FIELD_OF_VIEW)).toBeCloseTo(1000, 9);
  });

  it('expresses the equidistant reading as a linear radial polynomial through its radius', () => {
    const radiusAngle = degreesToRadians(degrees(96));
    const model = new EquidistantModel({ radius: 900, radiusAngle, principalPoint: CENTRE });
    const { projection } = model;
    expect(projection.kind === 'radial-polynomial' && projection.coefficients.slice(1)).toEqual([
      0, 0, 0,
    ]);
    expect(radiusOf(projection, radiusAngle)).toBeCloseTo(900, 9);
    expect(radiusOf(projection, radians(radiusAngle / 2))).toBeCloseTo(450, 9);
  });

  it('refuses directions behind a Mei lens or beyond the half field of view', () => {
    const [lens] = parseOffsetString(OFFICE_CALIBRATION.offsetV3).lenses;
    if (!lens) throw new Error('no lens');
    const narrow = { projection: lens.model.projection, halfFieldOfView: HALF_FIELD_OF_VIEW };
    expect(projectDirection(narrow, directionAt(101))).toBeUndefined();
    expect(projectDirection(narrow, [0, 0, -1])).toBeUndefined();
  });
});
