import { describe, expect, it } from 'vitest';

import { mountingOf, rotationIntoBody, uprightImuFrame, UPRIGHT_MOUNTING } from './Mounting';
import { rotationAboutY, transformVector } from '../../../shared/math/Matrix3';
import type { Vector3 } from '../../../shared/math/Vector3';
import { degrees, degreesToRadians, radians } from '../../../shared/units/angle';
import {
  ALIGNED_IMU_FRAME,
  assumedImuFrame,
  toBodyFrame,
  type BodyAxes,
  type ImuFrame,
} from '../imu/ImuFrame';
import { syntheticGyroTrack } from '../../../../test/support/syntheticGyro';
import type { GyroTrack } from '../gyro/GyroTrack';

const DOWN: Vector3 = [0, 1, 0];
const FORWARD: Vector3 = [0, 0, 1];
const STILL: Vector3 = [0, 0, 0];

/**
 * A frame as if a recording had measured it: only a measured frame tells the mounting.
 */
function measuredFrame(bodyAxes: BodyAxes): ImuFrame {
  return { ...assumedImuFrame('test', bodyAxes), isVerified: true };
}

const MEASURED_ALIGNED = measuredFrame(['x', 'y', 'z']);

/**
 * The reaction to gravity of a camera leaning `lean` degrees from lens 0 up toward upright.
 */
function leaningFromLensUp(lean: number): Vector3 {
  const angle = degreesToRadians(degrees(lean));
  return [0, -Math.sin(angle), Math.cos(angle)];
}

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
    const mounting = mountingOf(restingWith([0.1, -0.99, 0]), MEASURED_ALIGNED);
    expect(mounting).toBe(UPRIGHT_MOUNTING);
    expectVector(transformVector(mounting.toBody, DOWN), DOWN);
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
      const mounting = mountingOf(restingWith(specificForce), MEASURED_ALIGNED);
      expect(mounting.name).toBe(name);
      expectVector(transformVector(mounting.toBody, DOWN), gravity);
    },
  );

  it.each([[[0, -1, 0]], [[0, 1, 0]], [[-1, 0, 0]], [[1, 0, 0]]] as const)(
    'faces a half turn from lens 0, where Studio centres a camera whose lens axis lies level (specific force %j)',
    (specificForce) => {
      const mounting = mountingOf(restingWith(specificForce), MEASURED_ALIGNED);
      expectVector(transformVector(mounting.toBody, FORWARD), [0, 0, -1]);
    },
  );

  it('faces a recording whose gravity cannot be read as an upright camera faces', () => {
    expectVector(transformVector(UPRIGHT_MOUNTING.toBody, FORWARD), [0, 0, -1]);
    expectVector(transformVector(UPRIGHT_MOUNTING.toBody, DOWN), DOWN);
  });

  it("faces a camera whose lens axis is the vertical along the body's minus x, as Studio centres the A1", () => {
    const lensUp = mountingOf(restingWith([0, 0, 1]), MEASURED_ALIGNED);
    const lensDown = mountingOf(restingWith([0, 0, -1]), MEASURED_ALIGNED);
    expectVector(transformVector(lensUp.toBody, FORWARD), [-1, 0, 0]);
    expectVector(transformVector(lensDown.toBody, FORWARD), [-1, 0, 0]);
  });

  it('reads gravity through the IMU frame', () => {
    const imuZIsBodyY = measuredFrame(['x', 'z', '-y']);
    const mounting = mountingOf(restingWith([0, 0, -1]), imuZIsBodyY);
    expect(mounting).toBe(UPRIGHT_MOUNTING);
  });

  it('goes by the samples at rest, leaving out those of a camera accelerating', () => {
    const gyro = syntheticGyroTrack(2, 100, (time) => ({
      acceleration: time < 0.5 ? [0, 0, 1] : [-3, 0, 0],
      angularVelocity: STILL,
    }));
    expect(mountingOf(gyro, MEASURED_ALIGNED).name).toBe('with lens 0 up');
  });

  it('keeps upright a camera whose IMU frame is a guess, whatever its gravity reads', () => {
    expect(mountingOf(restingWith([0, 1, 0]), ALIGNED_IMU_FRAME)).toBe(UPRIGHT_MOUNTING);
    expect(mountingOf(restingWith([0, 0, 1]), ALIGNED_IMU_FRAME)).toBe(UPRIGHT_MOUNTING);
  });

  it.each([
    [29, 'with lens 0 up'],
    [31, 'upright'],
    [46, 'upright'],
  ] as const)(
    'stands a camera leaning %i degrees from lens 0 up %s: lens-vertical only within 30 degrees',
    (lean, name) => {
      const gyro = restingWith(leaningFromLensUp(lean));
      expect(mountingOf(gyro, MEASURED_ALIGNED).name).toBe(name);
    },
  );

  it('keeps upright a camera that never rests', () => {
    const accelerating = restingWith([0, 0, 2]);
    expect(mountingOf(accelerating, MEASURED_ALIGNED)).toBe(UPRIGHT_MOUNTING);
  });
});

describe('uprightImuFrame', () => {
  it("reads the IMU into the mounting's upright frame, gravity's reaction pointing up", () => {
    const frame = measuredFrame(['-z', '-x', 'y']);
    const specificForce: Vector3 = [0, 1, 0];
    const mounting = mountingOf(restingWith(specificForce), frame);
    const upright = uprightImuFrame(frame, mounting);
    expectVector(toBodyFrame(upright, specificForce), [0, -1, 0]);
    expect(upright).toMatchObject({ name: frame.name, isVerified: frame.isVerified });
  });
});

describe('rotationIntoBody', () => {
  it("carries a rotation into the upright frame on into the body, the mounting's turn applied last", () => {
    const mounting = mountingOf(restingWith([0, 1, 0]), MEASURED_ALIGNED);
    const yaw = rotationAboutY(radians(Math.PI / 2));
    const intoBody = rotationIntoBody(mounting, yaw);
    expectVector(transformVector(intoBody, FORWARD), [1, 0, 0]);
  });
});
