import { magnitudeOf, type Vector3 } from '../../../shared/math/Vector3';
import type { Seconds } from '../../../shared/units/time';
import type { GyroTrack } from '../gyro/GyroTrack';
import { toBodyFrame, type ImuFrame } from '../imu/ImuFrame';

export interface SampleWindow {
  readonly start: number;
  /**
   * Exclusive.
   */
  readonly end: number;
}

const MICROSECONDS_PER_SECOND = 1e6;

/**
 * The window of `length` seconds in which the gyro reports the least motion: where the camera
 * rested, or at least moved least.
 */
export function stillestWindow(gyro: GyroTrack, frame: ImuFrame, length: Seconds): SampleWindow {
  const interval = (gyro.meanSampleInterval ?? MICROSECONDS_PER_SECOND) / MICROSECONDS_PER_SECOND;
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
 * A window whose mean rate exceeds this (radians per second, about one degree per second) is
 * motion, not bias: gyro offsets are a fraction of a degree per second.
 */
const MAX_BIAS_RATE = 0.02;

/**
 * The gyro's constant offset, taken as its mean reading over the stillest window. A camera
 * that never rests (mounted on a moving boat) gets no bias correction rather than having its
 * slowest real motion subtracted.
 */
export function estimateGyroBias(gyro: GyroTrack, frame: ImuFrame, window: Seconds): Vector3 {
  const { start, end } = stillestWindow(gyro, frame, window);
  const sum: [number, number, number] = [0, 0, 0];
  for (let index = start; index < end; index += 1) {
    const rate = toBodyFrame(frame, gyro.sampleAt(index).angularVelocity);
    sum[0] += rate[0];
    sum[1] += rate[1];
    sum[2] += rate[2];
  }
  const count = Math.max(end - start, 1);
  const mean: Vector3 = [sum[0] / count, sum[1] / count, sum[2] / count];
  return magnitudeOf(mean) <= MAX_BIAS_RATE ? mean : [0, 0, 0];
}
