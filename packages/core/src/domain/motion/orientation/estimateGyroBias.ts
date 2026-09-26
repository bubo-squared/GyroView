import {
  addVectors,
  magnitudeOf,
  scaleVector,
  ZERO_VECTOR3,
  type Vector3,
} from '../../../shared/math/Vector3';
import {
  microsecondsToSeconds,
  seconds,
  secondsToMicroseconds,
  type Seconds,
} from '../../../shared/units/time';
import type { GyroSample, GyroTrack } from '../gyro/GyroTrack';
import { toBodyFrame, type ImuFrame } from '../imu/ImuFrame';

export interface SampleWindow {
  readonly start: number;
  /**
   * Exclusive.
   */
  readonly end: number;
}

/**
 * A window whose mean rate exceeds this (radians per second, about one degree per second) is
 * motion, not bias: gyro offsets are a fraction of a degree per second.
 */
const MAX_BIAS_RATE = 0.02;
/**
 * Spacing assumed for a track too short to measure its own.
 */
const FALLBACK_INTERVAL = secondsToMicroseconds(seconds(1));

/**
 * The window of `length` seconds in which the gyro reports the least motion: where the camera
 * rested, or at least moved least.
 */
export function stillestWindow(gyro: GyroTrack, frame: ImuFrame, length: Seconds): SampleWindow {
  const interval = microsecondsToSeconds(gyro.meanSampleInterval ?? FALLBACK_INTERVAL);
  const size = Math.max(1, Math.min(gyro.length, Math.round(length / interval)));
  const magnitudes = Float64Array.from({ length: gyro.length }, (_unused, index) =>
    magnitudeOf(toBodyFrame(frame, gyro.sampleAt(index).angularVelocity)),
  );
  let windowSum = 0;
  for (let index = 0; index < size; index += 1) windowSum += magnitudes[index] ?? 0;
  let best = { start: 0, sum: windowSum };
  for (let start = 1; start + size <= gyro.length; start += 1) {
    windowSum += (magnitudes[start + size - 1] ?? 0) - (magnitudes[start - 1] ?? 0);
    if (windowSum < best.sum) best = { start, sum: windowSum };
  }
  return { start: best.start, end: best.start + size };
}

/**
 * A gyro track together with the frame its readings are expressed in.
 */
export interface FramedGyro {
  readonly gyro: GyroTrack;
  readonly frame: ImuFrame;
}

/**
 * The mean of one vector quantity over a window of samples, in the body frame.
 */
export function meanOverWindow(
  { gyro, frame }: FramedGyro,
  window: SampleWindow,
  quantity: (sample: GyroSample) => Vector3,
): Vector3 {
  let sum = ZERO_VECTOR3;
  for (let index = window.start; index < window.end; index += 1) {
    const measured = quantity(gyro.sampleAt(index));
    sum = addVectors(sum, toBodyFrame(frame, measured));
  }
  return scaleVector(sum, 1 / Math.max(window.end - window.start, 1));
}

/**
 * The gyro's constant offset, taken as its mean reading over the stillest window. A camera
 * that never rests (mounted on a moving boat) gets no bias correction rather than having its
 * slowest real motion subtracted.
 */
export function estimateGyroBias(gyro: GyroTrack, frame: ImuFrame, window: SampleWindow): Vector3 {
  const mean = meanOverWindow({ gyro, frame }, window, (sample) => sample.angularVelocity);
  return magnitudeOf(mean) <= MAX_BIAS_RATE ? mean : ZERO_VECTOR3;
}
