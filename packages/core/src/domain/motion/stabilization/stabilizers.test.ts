import { describe, expect, it } from 'vitest';

import { STABILIZATION_MODES } from './Stabilizer';
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
const X: Vector3 = [1, 0, 0];
const Y: Vector3 = [0, 1, 0];
const Z: Vector3 = [0, 0, 1];
const YAW_90 = quaternionFromAxisAngle(Y, radians(Math.PI / 2));
const YAW_180 = quaternionFromAxisAngle(Y, radians(Math.PI));
const ROLL_30 = quaternionFromAxisAngle(Z, radians(Math.PI / 6));
const START = seconds(0);
const SHORTLY_AFTER = seconds(0.1);
const ONE_TIME_CONSTANT = seconds(1);
const MUCH_LATER = seconds(10);

function forwardThrough(rotation: Matrix3): Vector3 {
  return transformVector(rotation, FORWARD);
}

function yawThenPitch(yawDegrees: number, pitchDegrees: number): Quaternion {
  return multiplyQuaternions(
    quaternionFromAxisAngle(Y, radians((yawDegrees * Math.PI) / 180)),
    quaternionFromAxisAngle(X, radians((pitchDegrees * Math.PI) / 180)),
  );
}

function expectVector(actual: Vector3, expected: Vector3, digits = 9): void {
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value, digits);
  }
}

describe('stabilizers', () => {
  it('off leaves the view attached to the camera', () => {
    expect(new OffStabilization().nextRotation()).toBe(IDENTITY_MATRIX3);
  });

  it('lock keeps the view fixed to the world: a camera yawed right shows world-forward on its left', () => {
    expectVector(forwardThrough(new LockStabilization().nextRotation(YAW_90)), [-1, 0, 0]);
  });

  it('horizon levels the roll but follows the heading', () => {
    const rolledAndYawed: Quaternion = multiplyQuaternions(YAW_90, ROLL_30);
    const rotation = new HorizonStabilization().nextRotation(rolledAndYawed);
    expectVector(forwardThrough(rotation), FORWARD);
    expectVector(transformVector(rotation, VIEW_UP), [
      -Math.sin(Math.PI / 6),
      -Math.cos(Math.PI / 6),
      0,
    ]);
  });

  it('horizon keeps the heading when the camera points straight up or down', () => {
    const horizon = new HorizonStabilization();
    const nearlyUp = transformVector(horizon.nextRotation(yawThenPitch(30, 89)), VIEW_UP);
    const straightUp = transformVector(horizon.nextRotation(yawThenPitch(30, 90)), VIEW_UP);
    const pastUp = transformVector(horizon.nextRotation(yawThenPitch(30, 91)), VIEW_UP);
    expectVector(straightUp, nearlyUp, 1);
    expectVector(pastUp, nearlyUp, 1);
    const straightDown = horizon.nextRotation(yawThenPitch(30, -90));
    expectVector(forwardThrough(straightDown), [0, -1, 0], 6);
  });

  it('follow starts on the camera, lags far behind a sudden turn and snaps after a seek', () => {
    const follow = new FollowStabilization({
      timeConstant: seconds(1),
      maxContinuousGap: seconds(1),
    });
    expectVector(forwardThrough(follow.nextRotation(YAW_90, START)), FORWARD);
    const lagging = forwardThrough(follow.nextRotation(YAW_180, SHORTLY_AFTER));
    expect(lagging[0]).toBeLessThan(-0.9);
    expect(lagging[2]).toBeGreaterThan(0);
    expect(lagging[2]).toBeLessThan(0.3);
    expectVector(forwardThrough(follow.nextRotation(YAW_90, MUCH_LATER)), FORWARD);
  });

  it('follow catches up by 1 - 1/e per time constant, holds on a small step back and snaps on a seek back', () => {
    const follow = new FollowStabilization({
      timeConstant: seconds(1),
      maxContinuousGap: seconds(1),
    });
    follow.nextRotation(YAW_90, START);
    const afterOneConstant = forwardThrough(follow.nextRotation(YAW_180, ONE_TIME_CONSTANT));
    const caughtUp = Math.atan2(afterOneConstant[0], afterOneConstant[2]);
    expect(caughtUp).toBeCloseTo(-(Math.PI / 2) * Math.exp(-1), 3);
    const stepBack = seconds(0.98);
    const held = forwardThrough(follow.nextRotation(YAW_180, stepBack));
    expectVector(held, afterOneConstant);
    const sameTime = forwardThrough(follow.nextRotation(YAW_180, stepBack));
    expectVector(sameTime, afterOneConstant);
    const seekBack = follow.nextRotation(YAW_90, seconds(-5));
    expectVector(forwardThrough(seekBack), FORWARD);
  });

  it('builds the strategy for each mode', () => {
    expect(STABILIZATION_MODES.map((mode) => stabilizerFor(mode).constructor)).toEqual([
      OffStabilization,
      LockStabilization,
      HorizonStabilization,
      FollowStabilization,
    ]);
  });
});
