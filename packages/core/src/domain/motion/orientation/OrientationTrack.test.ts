import { describe, expect, it } from 'vitest';

import { OrientationTrack } from './OrientationTrack';
import { rotateVector } from '../../../shared/math/Quaternion';
import type { Vector3 } from '../../../shared/math/Vector3';
import { seconds } from '../../../shared/units/time';
import type { GyroTrack } from '../gyro/GyroTrack';
import { ALIGNED_IMU_FRAME } from '../imu/ImuFrame';
import {
  RESTING_UPRIGHT,
  SYNTHETIC_CLOCK,
  syntheticGyroTrack,
} from '../../../../test/support/syntheticGyro';

const FORWARD: Vector3 = [0, 0, 1];
const RATE_HZ = 200;
const QUARTER_TURN_PER_SECOND = Math.PI / 2;

function integrate(gyro: GyroTrack, options = {}): OrientationTrack {
  return OrientationTrack.integrate({
    gyro,
    clock: SYNTHETIC_CLOCK,
    frame: ALIGNED_IMU_FRAME,
    options,
  });
}

/**
 * Where the body's forward axis points in the world at `time`.
 */
function forwardAt(track: OrientationTrack, time: number): Vector3 {
  return rotateVector(track.orientationAt(seconds(time)), FORWARD);
}

/**
 * The accelerometer reading of a body at rest pitched up by `pitch` radians.
 */
function restingPitchedUp(pitch: number): Vector3 {
  return [0, -Math.cos(pitch), Math.sin(pitch)];
}

function atRest(): { acceleration: Vector3; angularVelocity: Vector3 } {
  return { acceleration: RESTING_UPRIGHT, angularVelocity: [0, 0, 0] };
}

function expectVector(actual: Vector3, expected: Vector3, digits: number): void {
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value, digits);
  }
}

describe('OrientationTrack', () => {
  it('turns with the gyro: a quarter turn per second about the vertical swings forward to the right', () => {
    const gyro = syntheticGyroTrack(2, RATE_HZ, (time) => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [0, time < 1 ? 0 : QUARTER_TURN_PER_SECOND, 0],
    }));
    const track = integrate(gyro);
    expectVector(forwardAt(track, 1), FORWARD, 3);
    expectVector(forwardAt(track, 2), [1, 0, 0], 2);
    expectVector(forwardAt(track, 1.5), [Math.SQRT1_2, 0, Math.SQRT1_2], 2);
  });

  it('removes the gyro bias measured while the camera rests', () => {
    const bias: Vector3 = [0.005, -0.008, 0.003];
    const gyro = syntheticGyroTrack(10, RATE_HZ, () => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: bias,
    }));
    const track = integrate(gyro, { gravityGain: 0 });
    expectVector(forwardAt(track, 10), FORWARD, 4);
  });

  it('levels the initial pose from gravity: a camera pitched up starts with its forward axis raised', () => {
    const pitch = Math.PI / 6;
    const gyro = syntheticGyroTrack(1, RATE_HZ, () => ({
      acceleration: restingPitchedUp(pitch),
      angularVelocity: [0, 0, 0],
    }));
    expectVector(forwardAt(integrate(gyro), 0), [0, -Math.sin(pitch), Math.cos(pitch)], 3);
  });

  it('is pulled back towards gravity when the gyro and the accelerometer disagree', () => {
    const pitch = Math.PI / 12;
    const gyro = syntheticGyroTrack(30, RATE_HZ, (time) => ({
      acceleration: time < 1 ? RESTING_UPRIGHT : restingPitchedUp(pitch),
      angularVelocity: [0, 0, 0],
    }));
    const track = integrate(gyro, { gravityGain: 0.5 });
    expectVector(forwardAt(track, 30), [0, -Math.sin(pitch), Math.cos(pitch)], 2);
  });

  it('ignores accelerometer readings while the camera accelerates', () => {
    const gyro = syntheticGyroTrack(5, RATE_HZ, (time) => ({
      acceleration: time < 1 ? RESTING_UPRIGHT : [0, -1.5, 1.5],
      angularVelocity: [0, 0, 0],
    }));
    const track = integrate(gyro, { gravityGain: 1 });
    expectVector(forwardAt(track, 5), FORWARD, 4);
  });

  it('holds the first and last orientation outside the recorded span and is empty-safe', () => {
    const gyro = syntheticGyroTrack(1, RATE_HZ, () => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [0, QUARTER_TURN_PER_SECOND, 0],
    }));
    const track = integrate(gyro);
    expect(track.orientationAt(seconds(-5))).toEqual(track.orientationAt(seconds(0)));
    expect(track.orientationAt(seconds(9))).toEqual(track.orientationAt(seconds(1)));
    expect(track.startTime).toBe(0);
    expect(track.endTime).toBe(1);
    expect(integrate(syntheticGyroTrack(0, RATE_HZ, atRest)).length).toBe(1);
  });
});
