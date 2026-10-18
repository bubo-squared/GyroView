import { describe, expect, it } from 'vitest';

import {
  ROW_CORRECTION_COUNT,
  rollingShutterFor,
  rowCorrectionsAt,
  type RollingShutter,
} from './RollingShutter';
import { ALIGNED_IMU_FRAME } from '../imu/ImuFrame';
import type { Mounting } from '../mounting/Mounting';
import { OrientationTrack } from '../orientation/OrientationTrack';
import {
  angleBetweenRotations,
  IDENTITY_MATRIX3,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  type Matrix3,
} from '../../../shared/math/Matrix3';
import { radians } from '../../../shared/units/angle';
import { seconds } from '../../../shared/units/time';
import {
  RESTING_UPRIGHT,
  SYNTHETIC_CLOCK,
  syntheticGyroTrack,
} from '../../../../test/support/syntheticGyro';

const UNTURNED: Mounting = { name: 'unturned', toBody: IDENTITY_MATRIX3 };
const ON_ITS_SIDE: Mounting = { name: 'on its side', toBody: rotationAboutX(radians(Math.PI / 2)) };
const RATE = Math.PI / 2;
const READOUT = 0.02;
const TOP_FIRST: RollingShutter = { readout: seconds(READOUT), rowOrder: 'top-first' };

/**
 * A camera turning a quarter turn per second about its body's y from the start.
 */
const turning = OrientationTrack.integrate({
  gyro: syntheticGyroTrack(4, 1000, () => ({
    acceleration: RESTING_UPRIGHT,
    angularVelocity: [0, RATE, 0],
  })),
  clock: SYNTHETIC_CLOCK,
  frame: ALIGNED_IMU_FRAME,
});

function expectRotation(actual: Matrix3 | undefined, expected: Matrix3): void {
  expect(angleBetweenRotations(actual ?? IDENTITY_MATRIX3, expected)).toBeLessThan(1e-4);
}

describe('rollingShutterFor', () => {
  it("gives a camera whose row order is measured its readout, from the info record's time", () => {
    expect(rollingShutterFor({ model: 'Insta360 OneR', readoutTime: seconds(0.022) })).toEqual({
      readout: seconds(0.022),
      rowOrder: 'top-first',
    });
  });

  it('corrects nothing for a camera whose row order is not measured, or with no readout time', () => {
    expect(rollingShutterFor({ model: 'Insta360 X5', readoutTime: seconds(0.02) })).toBeUndefined();
    expect(rollingShutterFor({ model: 'Insta360 OneR', readoutTime: undefined })).toBeUndefined();
    expect(rollingShutterFor({ model: 'Insta360 OneR', readoutTime: seconds(0) })).toBeUndefined();
  });
});

describe('rowCorrectionsAt', () => {
  it("turns each row's directions to where the body was when that row was read", () => {
    const corrections = rowCorrectionsAt(
      { orientations: turning, mounting: UNTURNED },
      seconds(1),
      TOP_FIRST,
    );
    expect(corrections).toHaveLength(ROW_CORRECTION_COUNT);
    // The top row was read half a readout before the frame's time, the bottom half after: the
    // body had turned less, then more, about its y.
    const halfReadoutTurn = (RATE * READOUT) / 2;
    expectRotation(corrections[0], rotationAboutY(radians(halfReadoutTurn)));
    expectRotation(corrections[(ROW_CORRECTION_COUNT - 1) / 2], IDENTITY_MATRIX3);
    expectRotation(corrections.at(-1), rotationAboutY(radians(-halfReadoutTurn)));
  });

  it('reads the rows the other way for a sensor read from the bottom up', () => {
    const motion = { orientations: turning, mounting: UNTURNED };
    const topFirst = rowCorrectionsAt(motion, seconds(1), TOP_FIRST);
    const bottomFirst = rowCorrectionsAt(motion, seconds(1), {
      ...TOP_FIRST,
      rowOrder: 'bottom-first',
    });
    expect(bottomFirst).toEqual(topFirst.toReversed());
  });

  it('expresses the corrections in the body, whichever way the camera was mounted', () => {
    const corrections = rowCorrectionsAt(
      { orientations: turning, mounting: ON_ITS_SIDE },
      seconds(1),
      TOP_FIRST,
    );
    // A quarter turn about x takes the upright frame's y onto the body's z: the turn the upright
    // frame made about its y, the body made about its z.
    expectRotation(corrections[0], rotationAboutZ(radians((RATE * READOUT) / 2)));
  });
});
