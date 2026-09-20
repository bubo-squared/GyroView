import { describe, expect, it } from 'vitest';

import { estimateGyroBias, stillestWindow } from './estimateGyroBias';
import { seconds } from '../../../shared/units/time';
import { ALIGNED_IMU_FRAME } from '../imu/ImuFrame';
import { RESTING_UPRIGHT, syntheticGyroTrack } from '../../../../test/support/syntheticGyro';

const RATE_HZ = 100;

describe('gyro bias estimation', () => {
  it('finds the stillest window and reads the bias there', () => {
    const gyro = syntheticGyroTrack(6, RATE_HZ, (time) => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: time > 2 && time < 4 ? [0.005, -0.004, 0.006] : [0.8, 0.2, 0.1],
    }));
    const window = stillestWindow(gyro, ALIGNED_IMU_FRAME, seconds(1));
    expect(window.start / RATE_HZ).toBeGreaterThan(2);
    expect(window.end / RATE_HZ).toBeLessThan(4);
    const bias = estimateGyroBias(gyro, ALIGNED_IMU_FRAME, seconds(1));
    expect(bias[0]).toBeCloseTo(0.005, 4);
    expect(bias[1]).toBeCloseTo(-0.004, 4);
    expect(bias[2]).toBeCloseTo(0.006, 4);
  });

  it('assumes no bias when the camera never rests', () => {
    const gyro = syntheticGyroTrack(3, RATE_HZ, () => ({
      acceleration: RESTING_UPRIGHT,
      angularVelocity: [0, 0.3, 0],
    }));
    expect(estimateGyroBias(gyro, ALIGNED_IMU_FRAME, seconds(0.5))).toEqual([0, 0, 0]);
  });
});
