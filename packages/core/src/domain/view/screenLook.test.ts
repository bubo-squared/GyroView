import { describe, expect, it } from 'vitest';

import { screenLookOf, screenRotationOf, type DeviceAttitude } from './screenLook';
import { viewRotation } from './ViewState';
import { degrees } from '../../shared/units/angle';

const ANGLE_DIGITS = 9;
/**
 * At a pole the look takes the yaw alone, which leaves the picture within a millionth of a radian.
 */
const ROTATION_TOLERANCE = 1e-6;

/**
 * The browser's three angles for a pose, the screen's content upright on the device.
 */
function attitudeOf(alpha: number, beta: number, gamma: number): DeviceAttitude {
  return {
    alpha: degrees(alpha),
    beta: degrees(beta),
    gamma: degrees(gamma),
    screenAngle: degrees(0),
  };
}

/**
 * The pose with the screen's content turned by `screenAngle`, as `screen.orientation.angle` says.
 */
function onScreen(attitude: DeviceAttitude, screenAngle: number): DeviceAttitude {
  return { ...attitude, screenAngle: degrees(screenAngle) };
}

/**
 * Every `step` degrees from `start` up to `end`, `end` excluded.
 */
function anglesFrom(start: number, end: number, step: number): number[] {
  return Array.from(
    { length: Math.ceil((end - start) / step) },
    (_, index) => start + index * step,
  );
}

function expectLook(
  attitude: DeviceAttitude,
  expected: { yaw: number; pitch: number; roll: number },
): void {
  const look = screenLookOf(attitude);
  expect(look.yaw).toBeCloseTo(expected.yaw, ANGLE_DIGITS);
  expect(look.pitch).toBeCloseTo(expected.pitch, ANGLE_DIGITS);
  expect(look.roll).toBeCloseTo(expected.roll, ANGLE_DIGITS);
}

/**
 * The view the look turns to draws exactly the screen's own rotation.
 */
function expectLookDrawsTheScreen(attitude: DeviceAttitude): void {
  const look = screenLookOf(attitude);
  for (const angle of [look.yaw, look.pitch, look.roll]) expect(Number.isFinite(angle)).toBe(true);
  const drawn = viewRotation({ ...look, fieldOfView: degrees(90) });
  const screen = screenRotationOf(attitude);
  for (const [index, value] of screen.entries()) {
    expect(Math.abs((drawn[index] ?? NaN) - value)).toBeLessThan(ROTATION_TOLERANCE);
  }
}

describe('the look through a screen held up as a window', () => {
  it('looks straight ahead, level, with the phone upright in portrait', () => {
    expectLook(attitudeOf(0, 90, 0), { yaw: 0, pitch: 0, roll: 0 });
  });

  it('looks right when the phone turns right, alpha counting the other way round', () => {
    expectLook(attitudeOf(270, 90, 0), { yaw: 90, pitch: 0, roll: 0 });
    expectLook(attitudeOf(30, 90, 0), { yaw: -30, pitch: 0, roll: 0 });
  });

  it('looks up as the phone tips back, and down as it tips forward', () => {
    expectLook(attitudeOf(0, 120, 0), { yaw: 0, pitch: 30, roll: 0 });
    expectLook(attitudeOf(0, 45, 0), { yaw: 0, pitch: -45, roll: 0 });
  });

  it('rolls the view clockwise as far as the phone rolls clockwise, keeping the horizon level', () => {
    // The phone upright, then turned 30 degrees clockwise about its screen, as the browser
    // reports that pose.
    expectLook(attitudeOf(270, 60, 90), { yaw: 0, pitch: 0, roll: 30 });
  });

  it.each([
    { name: 'landscape, turned left', attitude: onScreen(attitudeOf(90, 0, -90), 90) },
    {
      name: 'landscape, the same pose as Android may report it',
      attitude: onScreen(attitudeOf(270, 180, 90), 90),
    },
    { name: 'landscape, turned right', attitude: onScreen(attitudeOf(270, 0, 90), 270) },
    { name: 'portrait upside down', attitude: onScreen(attitudeOf(180, -90, 0), 180) },
  ])('looks straight ahead, level, with the screen turned: $name', ({ attitude }) => {
    expectLook(attitude, { yaw: 0, pitch: 0, roll: 0 });
  });

  it('only rolls the view when the screen alone turns', () => {
    expectLook(onScreen(attitudeOf(0, 90, 0), 90), { yaw: 0, pitch: 0, roll: 90 });
  });

  it('looks straight down with the phone flat, screen up, and straight up with it screen down', () => {
    expect(screenLookOf(attitudeOf(0, 0, 0)).pitch).toBeCloseTo(-90, ANGLE_DIGITS);
    expect(screenLookOf(attitudeOf(0, 180, 0)).pitch).toBeCloseTo(90, ANGLE_DIGITS);
  });

  it.each([0, 45, 135, 270])(
    'reads a finite look that draws the screen at the poles, alpha %d',
    (alpha) => {
      for (const beta of [0, 180, -180]) expectLookDrawsTheScreen(attitudeOf(alpha, beta, 0));
    },
  );

  it('draws the screen exactly for attitudes all round, the screen turned every way', () => {
    const poses = anglesFrom(0, 360, 37).flatMap((alpha) =>
      anglesFrom(-180, 180, 29).flatMap((beta) =>
        anglesFrom(-90, 90, 23).map((gamma) => attitudeOf(alpha, beta, gamma)),
      ),
    );
    for (const pose of poses) {
      for (const screenAngle of [0, 90, 180, 270])
        expectLookDrawsTheScreen(onScreen(pose, screenAngle));
    }
  });
});
