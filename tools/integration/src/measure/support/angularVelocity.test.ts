import { quaternionFromAxisAngle, radians, type OrientationTrack } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { angularVelocityAt } from './angularVelocity';

/**
 * A camera turning about the world's z axis at `rate` radians a second.
 */
function turningAbout(rate: number): OrientationTrack {
  return {
    orientationAt: (time: number) => quaternionFromAxisAngle([0, 0, 1], radians(rate * time)),
  } as unknown as OrientationTrack;
}

describe('angularVelocityAt', () => {
  it('reads a steady turn as its rate about its axis', () => {
    const velocity = angularVelocityAt(turningAbout(2), 1);
    expect(velocity[0]).toBeCloseTo(0, 9);
    expect(velocity[1]).toBeCloseTo(0, 9);
    expect(velocity[2]).toBeCloseTo(2, 6);
  });

  it('reads a turn the other way as a negative rate', () => {
    expect(angularVelocityAt(turningAbout(-0.5), 3)[2]).toBeCloseTo(-0.5, 6);
  });
});
