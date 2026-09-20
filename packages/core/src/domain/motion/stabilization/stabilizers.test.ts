import { describe, expect, it } from 'vitest';

import {
  FollowStabilization,
  HorizonStabilization,
  LockStabilization,
  OffStabilization,
  stabilizerFor,
} from './stabilizers';
import { IDENTITY_MATRIX3, transformVector, type Matrix3 } from '../../../shared/math/Matrix3';
import {
  multiplyQuaternions,
  quaternionFromAxisAngle,
  type Quaternion,
} from '../../../shared/math/Quaternion';
import type { Vector3 } from '../../../shared/math/Vector3';
import { radians } from '../../../shared/units/angle';
import { seconds } from '../../../shared/units/time';

const FORWARD: Vector3 = [0, 0, 1];
const VIEW_UP: Vector3 = [0, -1, 0];
const Y: Vector3 = [0, 1, 0];
const Z: Vector3 = [0, 0, 1];
const YAW_90 = quaternionFromAxisAngle(Y, radians(Math.PI / 2));
const YAW_180 = quaternionFromAxisAngle(Y, radians(Math.PI));
const ROLL_30 = quaternionFromAxisAngle(Z, radians(Math.PI / 6));
const START = seconds(0);
const SHORTLY_AFTER = seconds(0.1);
const MUCH_LATER = seconds(10);

function forwardThrough(rotation: Matrix3): Vector3 {
  return transformVector(rotation, FORWARD);
}

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

describe('stabilizers', () => {
  it('off leaves the view attached to the camera', () => {
    expect(new OffStabilization().rotationFor()).toBe(IDENTITY_MATRIX3);
  });

  it('lock keeps the view fixed to the world: a camera yawed right shows world-forward on its left', () => {
    expectVector(forwardThrough(new LockStabilization().rotationFor(YAW_90)), [-1, 0, 0]);
  });

  it('horizon levels the roll but follows the heading', () => {
    const rolledAndYawed: Quaternion = multiplyQuaternions(YAW_90, ROLL_30);
    const rotation = new HorizonStabilization().rotationFor(rolledAndYawed);
    expectVector(forwardThrough(rotation), FORWARD);
    expectVector(transformVector(rotation, VIEW_UP), [
      -Math.sin(Math.PI / 6),
      -Math.cos(Math.PI / 6),
      0,
    ]);
  });

  it('follow starts on the camera, lags far behind a sudden turn and snaps after a seek', () => {
    const follow = new FollowStabilization({
      timeConstant: seconds(1),
      maxContinuousGap: seconds(1),
    });
    expectVector(forwardThrough(follow.rotationFor(YAW_90, START)), FORWARD);
    const lagging = forwardThrough(follow.rotationFor(YAW_180, SHORTLY_AFTER));
    expect(lagging[0]).toBeLessThan(-0.9);
    expect(lagging[2]).toBeGreaterThan(0);
    expect(lagging[2]).toBeLessThan(0.3);
    expectVector(forwardThrough(follow.rotationFor(YAW_90, MUCH_LATER)), FORWARD);
  });

  it('builds the strategy for each mode', () => {
    const modes = ['off', 'lock', 'horizon', 'follow'] as const;
    expect(modes.map((mode) => stabilizerFor(mode).mode)).toEqual([...modes]);
  });
});
