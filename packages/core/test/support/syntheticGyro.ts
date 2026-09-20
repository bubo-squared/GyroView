import { GyroTrack } from '../../src/domain/motion/gyro/GyroTrack';
import { CaptureClock } from '../../src/domain/motion/timing/CaptureClock';
import type { Vector3 } from '../../src/shared/math/Vector3';
import { microseconds, milliseconds } from '../../src/shared/units/time';

export interface SyntheticSample {
  readonly time: number;
  readonly acceleration: Vector3;
  readonly angularVelocity: Vector3;
}

export const SYNTHETIC_CLOCK = new CaptureClock(microseconds(1_000_000), milliseconds(0));
const MICROSECONDS_PER_SECOND = 1e6;

/**
 * A gyro track from a function of time, sampled at `rate` Hz over `duration` seconds, stamped
 * on {@link SYNTHETIC_CLOCK} so that video time equals `time`.
 */
export function syntheticGyroTrack(
  duration: number,
  rate: number,
  sampleAt: (time: number) => Omit<SyntheticSample, 'time'>,
): GyroTrack {
  const count = Math.round(duration * rate) + 1;
  const captureTimes = new Float64Array(count);
  const accelerations = new Float32Array(count * 3);
  const angularVelocities = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const time = index / rate;
    const sample = sampleAt(time);
    captureTimes[index] =
      SYNTHETIC_CLOCK.firstFrameCaptureTime + Math.round(time * MICROSECONDS_PER_SECOND);
    accelerations.set(sample.acceleration, index * 3);
    angularVelocities.set(sample.angularVelocity, index * 3);
  }
  return new GyroTrack(captureTimes, accelerations, angularVelocities);
}

/**
 * The accelerometer reading of a body at rest and upright: gravity's reaction along body -y.
 */
export const RESTING_UPRIGHT: Vector3 = [0, -1, 0];
