import { describe, expect, it } from 'vitest';

import type { LensModel, LensProjectionParameters } from './LensModel';
import { parseOffsetString } from './parseOffsetString';
import type { PixelPoint } from './PixelPoint';
import type { Vector3 } from '../../shared/math/Vector3';
import { OFFICE_CALIBRATION } from '../../../test/support/officeCalibration';

const ANGLES_DEGREES = [5, 30, 60, 85, 98];
const AZIMUTHS_DEGREES = [0, 45, 130, 250];

function directionAt(angleDegrees: number, azimuthDegrees: number): Vector3 {
  const theta = (angleDegrees * Math.PI) / 180;
  const phi = (azimuthDegrees * Math.PI) / 180;
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
}

/**
 * Evaluates the shader-side parameters in TypeScript, the way the GLSL does.
 */
function projectWithParameters(
  parameters: LensProjectionParameters,
  direction: Vector3,
): PixelPoint {
  const [x, y, z] = direction;
  if (parameters.kind === 'radial-polynomial') {
    const theta = Math.atan2(Math.hypot(x, y), z);
    const [c1, c2, c3, c4] = parameters.coefficients;
    const radius = theta * (c1 + theta * (c2 + theta * (c3 + theta * c4)));
    const lateral = Math.hypot(x, y);
    return {
      x: parameters.principalPoint.x + (radius * x) / lateral,
      y: parameters.principalPoint.y + (radius * y) / lateral,
    };
  }
  const depth = z + parameters.xi;
  const [mx, my] = [x / depth, y / depth];
  const r2 = mx * mx + my * my;
  const [k1, k2, k3] = parameters.radial;
  const [p1, p2] = parameters.tangential;
  const radialFactor = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
  const tangentialX = 2 * p1 * mx * my + p2 * (r2 + 2 * mx * mx);
  const tangentialY = p1 * (r2 + 2 * my * my) + 2 * p2 * mx * my;
  return {
    x: parameters.focal[0] * (radialFactor * mx + tangentialX) + parameters.principalPoint.x,
    y: parameters.focal[1] * (radialFactor * my + tangentialY) + parameters.principalPoint.y,
  };
}

function expectParametersMatchModel(model: LensModel): void {
  for (const angle of ANGLES_DEGREES) {
    for (const azimuth of AZIMUTHS_DEGREES) {
      const direction = directionAt(angle, azimuth);
      const expected = model.project(direction);
      if (!expected) throw new Error(`the model does not image ${angle} degrees`);
      const actual = projectWithParameters(model.projection, direction);
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    }
  }
}

describe('LensModel.projection', () => {
  it('lets the shader reproduce the Mei model pixel for pixel', () => {
    for (const lens of parseOffsetString(OFFICE_CALIBRATION.offsetV3).lenses) {
      expect(lens.model.projection.kind).toBe('mei');
      expectParametersMatchModel(lens.model);
    }
  });

  it('folds the polynomial scale into radial coefficients the shader can evaluate', () => {
    for (const lens of parseOffsetString(OFFICE_CALIBRATION.offsetV2).lenses) {
      expect(lens.model.projection.kind).toBe('radial-polynomial');
      expectParametersMatchModel(lens.model);
    }
  });

  it('expresses the equidistant fallback as a linear radial polynomial', () => {
    for (const lens of parseOffsetString(OFFICE_CALIBRATION.offset).lenses) {
      const { projection } = lens.model;
      expect(projection.kind).toBe('radial-polynomial');
      if (projection.kind === 'radial-polynomial') {
        expect(projection.coefficients.slice(1)).toEqual([0, 0, 0]);
      }
      expectParametersMatchModel(lens.model);
    }
  });
});
