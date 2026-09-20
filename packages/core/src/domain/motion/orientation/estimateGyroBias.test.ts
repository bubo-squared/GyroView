import { describe, expect, it } from 'vitest';

import { estimateGyroBias, meanOverWindow, stillestWindow } from './estimateGyroBias';
import { seconds } from '../../../shared/units/time';
import { ALIGNED_IMU_FRAME } from '../imu/ImuFrame';
import { RESTING_UPRIGHT, syntheticGyroTrack } from '../../../../test/support/syntheticGyro';

const RATE_HZ = 100;

/**
 * Fast turning with a quiet stretch from 1 to 3 seconds and a quieter one from 5 to 6.5 seconds.
 */
function twoQuietStretchesRateAt(time: number): number {
  if (time > 1 && time < 3) return 0.05;
  return time > 5 && time < 6.5 ? 0.01 : 0.5;
}

describe('gyro bias estimation', () => {
  it('finds the stillest window and reads the bias there', () => {
    const gyro = syntheticGyroTrack(6, RATE_HZ, (time) => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: time > 2 && time < 4 ? [0.005, -0.004, 0.006] : [0.8, 0.2, 0.1],
    }));
    const window = stillestWindow(gyro, ALIGNED_IMU_FRAME, seconds(1));
    expect(window.end - window.start).toBe(RATE_HZ);
    expect(window.start / RATE_HZ).toBeGreaterThan(2);
    expect(window.end / RATE_HZ).toBeLessThan(4);
    const bias = estimateGyroBias(gyro, ALIGNED_IMU_FRAME, window);
    expect(bias[0]).toBeCloseTo(0.005, 4);
    expect(bias[1]).toBeCloseTo(-0.004, 4);
    expect(bias[2]).toBeCloseTo(0.006, 4);
  });

  it('picks the quietest of several quiet stretches', () => {
    const gyro = syntheticGyroTrack(8, RATE_HZ, (time) => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [twoQuietStretchesRateAt(time), 0, 0],
    }));
    const window = stillestWindow(gyro, ALIGNED_IMU_FRAME, seconds(1));
    expect(window.start / RATE_HZ).toBeGreaterThanOrEqual(5);
    expect(window.end / RATE_HZ).toBeLessThanOrEqual(6.5);
  });

  it('assumes no bias when the camera never rests', () => {
    const gyro = syntheticGyroTrack(3, RATE_HZ, () => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [0, 0.3, 0],
    }));
    const window = stillestWindow(gyro, ALIGNED_IMU_FRAME, seconds(0.5));
    expect(estimateGyroBias(gyro, ALIGNED_IMU_FRAME, window)).toEqual([0, 0, 0]);
  });

  it('averages a quantity over a window in the body frame', () => {
    const gyro = syntheticGyroTrack(1, RATE_HZ, (time) => ({
      acceleration: [time, 0, 0],
      angularVelocity: [0, 0, 0],
    }));
    const mean = meanOverWindow(
      { gyro, frame: ALIGNED_IMU_FRAME },
      { start: 0, end: 101 },
      (sample) => sample.acceleration,
    );
    expect(mean[0]).toBeCloseTo(0.5, 9);
    expect(mean[1]).toBe(0);
  });
});
