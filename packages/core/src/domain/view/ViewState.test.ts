import { describe, expect, it } from 'vitest';

import { clampView, DEFAULT_VIEW, viewRotation } from './ViewState';
import { transformVector } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';

const FORWARD: Vector3 = [0, 0, 1];

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

describe('ViewState', () => {
  it('looks forward by default with a 90 degree rectilinear view', () => {
    expect(DEFAULT_VIEW).toEqual({ yaw: 0, pitch: 0, fieldOfView: 90, projection: 'rectilinear' });
    expectVector(transformVector(viewRotation(DEFAULT_VIEW), FORWARD), FORWARD);
  });

  it('yaws to the right and pitches up', () => {
    const yawed = viewRotation({ ...DEFAULT_VIEW, yaw: degrees(90) });
    const pitched = viewRotation({ ...DEFAULT_VIEW, pitch: degrees(90) });
    expectVector(transformVector(yawed, FORWARD), [1, 0, 0]);
    expectVector(transformVector(pitched, FORWARD), [0, -1, 0]);
  });

  it('wraps the yaw, clamps the pitch at the poles and the field of view to its range', () => {
    const overshoot = {
      ...DEFAULT_VIEW,
      yaw: degrees(190),
      pitch: degrees(100),
      fieldOfView: degrees(200),
    };
    expect(clampView(overshoot)).toEqual({
      yaw: -170,
      pitch: 90,
      fieldOfView: 120,
      projection: 'rectilinear',
    });
    const undershoot = {
      ...DEFAULT_VIEW,
      yaw: degrees(-180),
      pitch: degrees(-95),
      fieldOfView: degrees(5),
    };
    expect(clampView(undershoot)).toEqual({
      yaw: 180,
      pitch: -90,
      fieldOfView: 30,
      projection: 'rectilinear',
    });
    expect(clampView({ ...DEFAULT_VIEW, yaw: degrees(-540) }).yaw).toBe(180);
  });
});
