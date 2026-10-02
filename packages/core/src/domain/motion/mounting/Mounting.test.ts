import { describe, expect, it } from 'vitest';

import { mountingOf, uprightImuFrame, UPRIGHT_MOUNTING } from './Mounting';
import { IDENTITY_MATRIX3, transformVector } from '../../../shared/math/Matrix3';
import type { Vector3 } from '../../../shared/math/Vector3';
import { ALIGNED_IMU_FRAME, assumedImuFrame, toBodyFrame } from '../imu/ImuFrame';
import { syntheticGyroTrack } from '../../../../test/support/syntheticGyro';
import type { GyroTrack } from '../gyro/GyroTrack';

const DOWN: Vector3 = [0, 1, 0];
const FORWARD: Vector3 = [0, 0, 1];
const STILL: Vector3 = [0, 0, 0];

/**
 * A camera at rest for two seconds whose accelerometer reads `specificForce` in the body frame.
 */
function restingWith(specificForce: Vector3): GyroTrack {
  return syntheticGyroTrack(2, 100, () => ({
    acceleration: specificForce,
    angularVelocity: STILL,
  }));
}

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value, 9);
  }
}

describe('mountingOf', () => {
  it("keeps a camera upright whose gravity lies along the body's down", () => {
    const mounting = mountingOf(restingWith([0.1, -0.99, 0]), ALIGNED_IMU_FRAME);
    expect(mounting).toBe(UPRIGHT_MOUNTING);
    expect(mounting).toEqual({ name: 'upright', toBody: IDENTITY_MATRIX3 });
  });

  it.each([
    ['upside down', [0, 1, 0], [0, -1, 0]],
    ['on its right side', [-1, 0, 0], [1, 0, 0]],
    ['on its left side', [1, 0, 0], [-1, 0, 0]],
    ['with lens 0 up', [0, 0, 1], [0, 0, -1]],
    ['with lens 0 down', [0, 0, -1], [0, 0, 1]],
  ] as const)(
    'turns the down of a camera standing %s onto its gravity',
    (name, specificForce, gravity) => {
      const mounting = mountingOf(restingWith(specificForce), ALIGNED_IMU_FRAME);
      expect(mounting.name).toBe(name);
      expectVector(transformVector(mounting.toBody, DOWN), gravity);
    },
  );

  it.each([[[0, 1, 0]], [[-1, 0, 0]], [[1, 0, 0]]] as const)(
    'keeps lens 0 forward when gravity lies across its axis (specific force %j)',
    (specificForce) => {
      const mounting = mountingOf(restingWith(specificForce), ALIGNED_IMU_FRAME);
      expectVector(transformVector(mounting.toBody, FORWARD), FORWARD);
    },
  );

  it("faces a camera whose lens axis is the vertical along the body's minus x, as Studio centres the A1", () => {
    const lensUp = mountingOf(restingWith([0, 0, 1]), ALIGNED_IMU_FRAME);
    const lensDown = mountingOf(restingWith([0, 0, -1]), ALIGNED_IMU_FRAME);
    expectVector(transformVector(lensUp.toBody, FORWARD), [-1, 0, 0]);
    expectVector(transformVector(lensDown.toBody, FORWARD), [-1, 0, 0]);
  });

  it('reads gravity through the IMU frame', () => {
    const imuZIsBodyY = assumedImuFrame('test', ['x', 'z', '-y']);
    const mounting = mountingOf(restingWith([0, 0, -1]), imuZIsBodyY);
    expect(mounting).toBe(UPRIGHT_MOUNTING);
  });

  it('goes by the samples at rest, leaving out those of a camera accelerating', () => {
    const gyro = syntheticGyroTrack(2, 100, (time) => ({
      acceleration: time < 0.5 ? [0, 0, 1] : [-3, 0, 0],
      angularVelocity: STILL,
    }));
    expect(mountingOf(gyro, ALIGNED_IMU_FRAME).name).toBe('with lens 0 up');
  });

  it('keeps upright a camera that never rests', () => {
    const accelerating = restingWith([0, 0, 2]);
    expect(mountingOf(accelerating, ALIGNED_IMU_FRAME)).toBe(UPRIGHT_MOUNTING);
  });
});

describe('uprightImuFrame', () => {
  it("reads the IMU into the mounting's upright frame, gravity's reaction pointing up", () => {
    const frame = assumedImuFrame('test', ['-z', '-x', 'y']);
    const specificForce: Vector3 = [0, 1, 0];
    const mounting = mountingOf(restingWith(specificForce), frame);
    const upright = uprightImuFrame(frame, mounting);
    expectVector(toBodyFrame(upright, specificForce), [0, -1, 0]);
    expect(upright).toMatchObject({ name: frame.name, isVerified: frame.isVerified });
  });
});
