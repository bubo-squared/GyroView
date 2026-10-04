import { describe, expect, it } from 'vitest';

import { clampView, DEFAULT_VIEW, isSameView, viewRotation } from './ViewState';
import { transformVector } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';
import { captureError } from '../../../test/support/errors';

const FORWARD: Vector3 = [0, 0, 1];

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

describe('ViewState', () => {
  it('looks forward by default with a 90 degree view', () => {
    expect(DEFAULT_VIEW).toEqual({ yaw: 0, pitch: 0, roll: 0, fieldOfView: 90 });
    expectVector(transformVector(viewRotation(DEFAULT_VIEW), FORWARD), FORWARD);
  });

  it('yaws to the right and pitches up', () => {
    const yawed = viewRotation({ ...DEFAULT_VIEW, yaw: degrees(90) });
    const pitched = viewRotation({ ...DEFAULT_VIEW, pitch: degrees(90) });
    expectVector(transformVector(yawed, FORWARD), [1, 0, 0]);
    expectVector(transformVector(pitched, FORWARD), [0, -1, 0]);
  });

  it('rolls clockwise on the screen about the line of sight, after the yaw and the pitch', () => {
    const rolled = viewRotation({ ...DEFAULT_VIEW, roll: degrees(90) });
    // The screen's right turns to the body's down: the picture's top-right corner moves down.
    expectVector(transformVector(rolled, [1, 0, 0]), [0, 1, 0]);
    expectVector(transformVector(rolled, FORWARD), FORWARD);
    const turned = viewRotation({
      yaw: degrees(90),
      pitch: degrees(0),
      roll: degrees(90),
      fieldOfView: degrees(90),
    });
    expectVector(transformVector(turned, FORWARD), [1, 0, 0]);
    expectVector(transformVector(turned, [1, 0, 0]), [0, 1, 0]);
  });

  it('wraps the yaw, clamps the pitch at the poles and the field of view to its range', () => {
    const overshoot = {
      yaw: degrees(190),
      pitch: degrees(100),
      roll: degrees(270),
      fieldOfView: degrees(200),
    };
    expect(clampView(overshoot)).toEqual({ yaw: -170, pitch: 90, roll: -90, fieldOfView: 120 });
    const undershoot = {
      yaw: degrees(-180),
      pitch: degrees(-95),
      roll: degrees(-180),
      fieldOfView: degrees(5),
    };
    expect(clampView(undershoot)).toEqual({ yaw: 180, pitch: -90, roll: 180, fieldOfView: 30 });
    expect(clampView({ ...DEFAULT_VIEW, yaw: degrees(-540) }).yaw).toBe(180);
    expect(clampView({ ...DEFAULT_VIEW, yaw: degrees(180) }).yaw).toBe(180);
  });

  it('tells views apart by every angle', () => {
    expect(isSameView(DEFAULT_VIEW, { ...DEFAULT_VIEW })).toBe(true);
    expect(isSameView(DEFAULT_VIEW, { ...DEFAULT_VIEW, yaw: degrees(1) })).toBe(false);
    expect(isSameView(DEFAULT_VIEW, { ...DEFAULT_VIEW, pitch: degrees(1) })).toBe(false);
    expect(isSameView(DEFAULT_VIEW, { ...DEFAULT_VIEW, roll: degrees(1) })).toBe(false);
    expect(isSameView(DEFAULT_VIEW, { ...DEFAULT_VIEW, fieldOfView: degrees(91) })).toBe(false);
  });

  it('refuses non-finite angles', () => {
    expect(captureError(() => clampView({ ...DEFAULT_VIEW, yaw: degrees(NaN) }))).toMatchObject({
      code: 'invariant-violation',
    });
    expect(captureError(() => clampView({ ...DEFAULT_VIEW, roll: degrees(NaN) }))).toMatchObject({
      code: 'invariant-violation',
    });
  });
});
