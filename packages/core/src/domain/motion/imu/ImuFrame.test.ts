import { describe, expect, it } from 'vitest';

import {
  ALIGNED_IMU_FRAME,
  assumedImuFrame,
  imuFrameFor,
  toBodyFrame,
  X4_AIR_IMU_FRAME,
  X5_IMU_FRAME,
  X6_IMU_FRAME,
} from './ImuFrame';
import type { Vector3 } from '../../../shared/math/Vector3';
import { captureError } from '../../../../test/support/errors';

/**
 * Mean accelerometer readings (specific force, g) measured on the X5 recordings over one second.
 */
const OFFICE_ON_TABLE_UPRIGHT: Vector3 = [-0.068, 0.018, -0.999];
const SAILING_ON_A_POLE: Vector3 = [-0.955, -0.036, 0.294];

function expectVector(actual: Vector3, expected: Vector3, digits: number): void {
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value, digits);
  }
}

describe('ImuFrame', () => {
  it('maps the X5 accelerometer at rest on a table to an upward specific force along body -y', () => {
    expectVector(toBodyFrame(X5_IMU_FRAME, OFFICE_ON_TABLE_UPRIGHT), [-0.068, -0.999, -0.018], 3);
  });

  it('maps the X5 accelerometer on a pole to an upward specific force left of lens 0, along body -x', () => {
    const up = toBodyFrame(X5_IMU_FRAME, SAILING_ON_A_POLE);
    expect(up[0]).toBeLessThan(-0.9);
  });

  it('builds a proper rotation from signed axes', () => {
    const frame = assumedImuFrame('test', ['y', 'z', 'x']);
    expectVector(toBodyFrame(frame, [1, 2, 3]), [2, 3, 1], 9);
    expect(frame.toBody).toEqual([0, 1, 0, 0, 0, 1, 1, 0, 0]);
  });

  it('refuses a repeated axis and a reflection', () => {
    expect(captureError(() => assumedImuFrame('singular', ['x', 'x', 'z']))).toMatchObject({
      code: 'invariant-violation',
    });
    expect(captureError(() => assumedImuFrame('mirror', ['x', 'y', '-z']))).toMatchObject({
      code: 'invariant-violation',
    });
    expect(assumedImuFrame('turned', ['-x', 'z', 'y']).toBody).toEqual([
      -1, 0, 0, 0, 0, 1, 0, 1, 0,
    ]);
    expect(X5_IMU_FRAME.toBody).toEqual([1, 0, 0, 0, 0, 1, 0, -1, 0]);
  });

  it('picks the measured frame for the X4 Air, the X5 and the X6, and the unverified default for other cameras', () => {
    expect(imuFrameFor({ model: 'Insta360 X4 Air' })).toBe(X4_AIR_IMU_FRAME);
    expect(imuFrameFor({ model: 'Insta360 X5' })).toBe(X5_IMU_FRAME);
    expect(imuFrameFor({ model: 'Insta360 X6' })).toBe(X6_IMU_FRAME);
    expect(X4_AIR_IMU_FRAME).toMatchObject({ toBody: X5_IMU_FRAME.toBody, isVerified: true });
    expect(X6_IMU_FRAME).toMatchObject({ toBody: X5_IMU_FRAME.toBody, isVerified: true });
    expect(imuFrameFor({ model: 'Insta360 X3' })).toBe(ALIGNED_IMU_FRAME);
    expect(imuFrameFor({ model: 'Insta360 X4' })).toBe(ALIGNED_IMU_FRAME);
    expect(imuFrameFor({ model: 'Not an Insta360 X5' })).toBe(ALIGNED_IMU_FRAME);
    expect(imuFrameFor({ model: undefined }).isVerified).toBe(false);
  });
});
