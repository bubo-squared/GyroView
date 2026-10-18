import { describe, expect, it } from 'vitest';

import { STABILIZATION_MODES } from './Stabilizer';
import {
  FollowStabilization,
  HorizonStabilization,
  LockStabilization,
  OffStabilization,
  SmoothStabilization,
  stabilizerFor,
} from './stabilizers';
import { ALIGNED_IMU_FRAME } from '../imu/ImuFrame';
import { OrientationTrack } from '../orientation/OrientationTrack';
import {
  RESTING_UPRIGHT,
  SYNTHETIC_CLOCK,
  syntheticGyroTrack,
} from '../../../../test/support/syntheticGyro';
import {
  angleBetweenRotations,
  IDENTITY_MATRIX3,
  rotationAboutX,
  rotationAboutZ,
  transformVector,
  transposeMatrix,
  type Matrix3,
} from '../../../shared/math/Matrix3';
import {
  multiplyQuaternions,
  quaternionFromAxisAngle,
  rotateVector,
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
    expect(STABILIZATION_MODES.map((mode) => stabilizerFor(mode, turning).constructor)).toEqual([
      OffStabilization,
      LockStabilization,
      HorizonStabilization,
      SmoothStabilization,
      FollowStabilization,
    ]);
  });
});

/**
 * Ten seconds of a camera turning about the vertical at `rate` and shaking its heading by
 * `shake` radians at four hertz on top.
 */
function headingTrack(rate: number, shake: number): OrientationTrack {
  const shakeRate = 2 * Math.PI * 4;
  return OrientationTrack.integrate({
    gyro: syntheticGyroTrack(10, 1000, (time) => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [0, rate + shake * shakeRate * Math.cos(shakeRate * time), 0],
    })),
    clock: SYNTHETIC_CLOCK,
    frame: ALIGNED_IMU_FRAME,
  });
}

const turning = headingTrack(Math.PI / 2, 0);
const MIDDLE = seconds(5);
/**
 * A quarter period of the shake after the middle: its heading furthest from the mean.
 */
const SHAKEN = seconds(5.0625);

interface ModeRotations {
  readonly smooth: Matrix3;
  readonly horizon: Matrix3;
  readonly lock: Matrix3;
}

function rotationsAt(track: OrientationTrack, time: ReturnType<typeof seconds>): ModeRotations {
  const orientation = track.orientationAt(time);
  return {
    smooth: stabilizerFor('smooth', track).nextRotation(orientation, time),
    horizon: new HorizonStabilization().nextRotation(orientation),
    lock: new LockStabilization().nextRotation(orientation),
  };
}

describe('smooth stabilization', () => {
  it('follows a steady turn without lag, its heading continuous through a half turn', () => {
    // A quarter turn a second passes a half turn every two seconds.
    const { smooth, horizon } = rotationsAt(turning, MIDDLE);
    expect(angleBetweenRotations(smooth, horizon)).toBeLessThan(1e-3);
  });

  it("takes the shake out of the camera's heading", () => {
    const shaking = headingTrack(0, (5 * Math.PI) / 180);
    const { smooth, horizon, lock } = rotationsAt(shaking, SHAKEN);
    expect(angleBetweenRotations(smooth, lock)).toBeLessThan(2e-3);
    expect(angleBetweenRotations(horizon, lock)).toBeGreaterThan(0.08);
  });

  it('keeps the horizon level, as horizon does', () => {
    const rolling = OrientationTrack.integrate({
      gyro: syntheticGyroTrack(4, 1000, () => ({
        acceleration: RESTING_UPRIGHT,
        angularVelocity: [0, Math.PI / 4, Math.PI / 8],
      })),
      clock: SYNTHETIC_CLOCK,
      frame: ALIGNED_IMU_FRAME,
    });
    const time = seconds(2);
    const smooth = stabilizerFor('smooth', rolling).nextRotation(rolling.orientationAt(time), time);
    const horizon = new HorizonStabilization().nextRotation(rolling.orientationAt(time));
    expectVector(transformVector(smooth, VIEW_UP), transformVector(horizon, VIEW_UP), 6);
  });

  it('holds a steady turn while the camera tumbles nearly upside down, where its twist spins', () => {
    // Turning an eighth of a turn a second about the vertical, the camera pitches over to 179.5
    // degrees, rolls a whole turn about its lens axis there in a fifth of a second, and pitches back. Nearly upside down,
    // the roll swings the twist about the vertical by up to a half turn between samples. The
    // accelerometer reads nothing, so the gyro alone turns the camera.
    const turnRate = Math.PI / 8;
    const flip = (179.5 * Math.PI) / 180;
    const ease = (from: number, to: number, time: number): number =>
      time <= from
        ? 0
        : time >= to
          ? 1
          : (1 - Math.cos((Math.PI * (time - from)) / (to - from))) / 2;
    const easeRate = (from: number, to: number, time: number): number =>
      time <= from || time >= to
        ? 0
        : ((Math.PI / (to - from)) * Math.sin((Math.PI * (time - from)) / (to - from))) / 2;
    const pitchAt = (time: number): number => flip * (ease(7, 8, time) - ease(8.5, 9.5, time));
    const pitchRateAt = (time: number): number =>
      flip * (easeRate(7, 8, time) - easeRate(8.5, 9.5, time));
    const rollAt = (time: number): number => 2 * Math.PI * ease(8, 8.2, time);
    const rollRateAt = (time: number): number => 2 * Math.PI * easeRate(8, 8.2, time);
    const tumbling = OrientationTrack.integrate({
      gyro: syntheticGyroTrack(16, 1000, (time) => {
        // The body turned about the vertical, then pitched about x, then rolled about z.
        const roll = radians(rollAt(time));
        const pitched = radians(pitchAt(time));
        const unroll = transposeMatrix(rotationAboutZ(roll));
        const unpitch = transposeMatrix(rotationAboutX(pitched));
        const turn = transformVector(unroll, transformVector(unpitch, [0, turnRate, 0]));
        const pitch = transformVector(unroll, [pitchRateAt(time), 0, 0]);
        return {
          acceleration: [0, 0, 0],
          angularVelocity: [
            turn[0] + pitch[0],
            turn[1] + pitch[1],
            turn[2] + pitch[2] + rollRateAt(time),
          ],
        };
      }),
      clock: SYNTHETIC_CLOCK,
      frame: ALIGNED_IMU_FRAME,
    });
    const smooth = stabilizerFor('smooth', tumbling);
    const facing = (time: number): number => {
      const at = seconds(time);
      const view = smooth.nextRotation(tumbling.orientationAt(at), at);
      const ahead = rotateVector(tumbling.orientationAt(at), transformVector(view, FORWARD));
      return Math.atan2(ahead[0], ahead[2]);
    };
    const wrapped = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
    // Beyond the smoothing's reach of the tumble and of the ends, the view has turned as the
    // camera did, and through the tumble it never spins.
    expect(wrapped(facing(12.75) - facing(3.25))).toBeCloseTo(wrapped(9.5 * turnRate), 2);
    for (let time = 5; time < 12; time += 0.1) {
      const step = wrapped(facing(time + 0.1) - facing(time));
      expect(Math.abs(step) / 0.1).toBeLessThan(3 * turnRate);
    }
  });

  it('is horizon without a recording to look ahead in', () => {
    expect(stabilizerFor('smooth')).toBeInstanceOf(HorizonStabilization);
  });
});
