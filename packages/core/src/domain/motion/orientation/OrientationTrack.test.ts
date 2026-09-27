import { describe, expect, it } from 'vitest';

import { OrientationTrack, type IntegrationOptions } from './OrientationTrack';
import { IDENTITY_QUATERNION, rotateVector } from '../../../shared/math/Quaternion';
import type { Vector3 } from '../../../shared/math/Vector3';
import { seconds } from '../../../shared/units/time';
import { GyroTrack } from '../gyro/GyroTrack';
import { ALIGNED_IMU_FRAME } from '../imu/ImuFrame';
import { captureError } from '../../../../test/support/errors';
import {
  RESTING_UPRIGHT,
  SYNTHETIC_CLOCK,
  syntheticGyroTrack,
} from '../../../../test/support/syntheticGyro';

const FORWARD: Vector3 = [0, 0, 1];
const RATE_HZ = 200;
const QUARTER_TURN_PER_SECOND = Math.PI / 2;

function integrate(gyro: GyroTrack, options?: IntegrationOptions): OrientationTrack {
  return OrientationTrack.integrate({
    gyro,
    clock: SYNTHETIC_CLOCK,
    frame: ALIGNED_IMU_FRAME,
    ...(options && { options }),
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

/**
 * Four seconds of a quarter turn per second about the vertical, one sample optionally stamped
 * `offset` seconds off where it belongs.
 */
function turningWithGlitch(glitch?: { index: number; offset: number }): OrientationTrack {
  const count = 4 * RATE_HZ;
  const captureTimes = Float64Array.from({ length: count }, (_unused, index) => {
    const offset = index === glitch?.index ? glitch.offset : 0;
    return SYNTHETIC_CLOCK.captureTimeOf(seconds(index / RATE_HZ + offset));
  });
  const accelerations = new Float32Array(count * 3);
  const angularVelocities = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    accelerations.set(RESTING_UPRIGHT, index * 3);
    angularVelocities.set([0, QUARTER_TURN_PER_SECOND, 0], index * 3);
  }
  return integrate(new GyroTrack(captureTimes, accelerations, angularVelocities), {
    gravityGain: 0,
  });
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

  it('interpolates between samples', () => {
    const coarseRate = 40;
    const gyro = syntheticGyroTrack(1, coarseRate, () => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [0, QUARTER_TURN_PER_SECOND, 0],
    }));
    const track = integrate(gyro, { gravityGain: 0 });
    const angleAt = (time: number): number => {
      const forward = forwardAt(track, time);
      return Math.atan2(forward[0], forward[2]);
    };
    for (const time of [0.5, 0.5125, 0.9875]) {
      expect(angleAt(time), `t=${String(time)}`).toBeCloseTo(QUARTER_TURN_PER_SECOND * time, 3);
    }
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

  it('takes the initial pose from the opening window, not from a later rest in another tilt', () => {
    const pitch = Math.PI / 6;
    const gyro = syntheticGyroTrack(12, RATE_HZ, (time) => ({
      acceleration: time < 0.5 ? restingPitchedUp(pitch) : RESTING_UPRIGHT,
      angularVelocity: [time < 0.5 ? 0.02 : 0, 0, 0],
    }));
    expectVector(forwardAt(integrate(gyro), 0), [0, -Math.sin(pitch), Math.cos(pitch)], 2);
  });

  it('starts level when the camera accelerates during the opening window', () => {
    const gyro = syntheticGyroTrack(2, RATE_HZ, (time) => ({
      acceleration: time < 0.6 ? [0, -2, 0] : RESTING_UPRIGHT,
      angularVelocity: [0, 0, 0],
    }));
    expect(integrate(gyro).orientationAt(seconds(0))).toEqual(IDENTITY_QUATERNION);
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

  it('does not spin through a gap in the samples', () => {
    const captureTimes = Float64Array.from(
      [0, 0.005, 0.01, 2.01, 2.015].map((time) => SYNTHETIC_CLOCK.captureTimeOf(seconds(time))),
    );
    const accelerations = new Float32Array(captureTimes.length * 3);
    const angularVelocities = new Float32Array(captureTimes.length * 3);
    for (let index = 0; index < captureTimes.length; index += 1) {
      accelerations.set(RESTING_UPRIGHT, index * 3);
      angularVelocities.set([0, 1, 0], index * 3);
    }
    const track = integrate(new GyroTrack(captureTimes, accelerations, angularVelocities), {
      gravityGain: 0,
    });
    const turned = Math.atan2(forwardAt(track, 2.015)[0], forwardAt(track, 2.015)[2]);
    expect(turned).toBeLessThan(0.1);
    expect(turned).toBeGreaterThan(0.05);
  });

  it('keeps its course through a sample stamped far off its neighbours', () => {
    const clean = turningWithGlitch();
    for (const offset of [5, -5]) {
      // The middle sample is where a lookup starts searching: the worst place for a glitch.
      const glitched = turningWithGlitch({ index: 2 * RATE_HZ, offset });
      for (let time = 0; time < 4; time += 0.1) {
        expectVector(forwardAt(glitched, time), forwardAt(clean, time), 2);
      }
    }
  });

  it('holds the first and last orientation outside the recorded span and is empty-safe', () => {
    const gyro = syntheticGyroTrack(1, RATE_HZ, () => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [0, QUARTER_TURN_PER_SECOND, 0],
    }));
    const track = integrate(gyro);
    expect(track.orientationAt(seconds(-5))).toEqual(track.orientationAt(seconds(0)));
    expect(track.orientationAt(seconds(9))).toEqual(track.orientationAt(seconds(1)));
    expect(integrate(syntheticGyroTrack(0, RATE_HZ, atRest)).length).toBe(1);
    const empty = integrate(
      new GyroTrack(new Float64Array(0), new Float32Array(0), new Float32Array(0)),
    );
    expect(empty.length).toBe(0);
    expect(empty.orientationAt(seconds(3))).toBe(IDENTITY_QUATERNION);
  });

  it('refuses samples that are not finite', () => {
    const gyro = syntheticGyroTrack(1, RATE_HZ, (time) => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [time > 0.5 ? NaN : 0, 0, 0],
    }));
    expect(captureError(() => integrate(gyro))).toMatchObject({ code: 'invariant-violation' });
  });
});
