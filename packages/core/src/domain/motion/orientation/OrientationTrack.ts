import { estimateGyroBias, stillestWindow } from './estimateGyroBias';
import { gravityCorrection, initialOrientation } from './gravity';
import { ensureInvariant } from '../../../shared/errors/GyroViewError';
import {
  IDENTITY_QUATERNION,
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionFromRotationVector,
  slerpQuaternions,
  type Quaternion,
} from '../../../shared/math/Quaternion';
import { isFiniteVector, type Vector3 } from '../../../shared/math/Vector3';
import { seconds, type Seconds } from '../../../shared/units/time';
import type { GyroTrack } from '../gyro/GyroTrack';
import { toBodyFrame, type ImuFrame } from '../imu/ImuFrame';
import type { CaptureClock } from '../timing/CaptureClock';

export interface IntegrationOptions {
  /**
   * How strongly the accelerometer pulls the estimate towards measured gravity, in radians per
   * second per radian of error (the Mahony proportional gain). Small, so the gyro rules within a
   * frame and gravity only removes drift.
   */
  readonly gravityGain: number;
  /**
   * Length of the stillest window used to estimate the gyro bias.
   */
  readonly biasWindow: Seconds;
}

export interface OrientationTrackParts {
  readonly gyro: GyroTrack;
  readonly clock: CaptureClock;
  readonly frame: ImuFrame;
  readonly options?: Partial<IntegrationOptions>;
}

const DEFAULT_GRAVITY_GAIN = 0.2;
const DEFAULT_BIAS_WINDOW_SECONDS = 0.5;

export const DEFAULT_INTEGRATION_OPTIONS: IntegrationOptions = {
  gravityGain: DEFAULT_GRAVITY_GAIN,
  biasWindow: seconds(DEFAULT_BIAS_WINDOW_SECONDS),
};

const QUATERNION_COMPONENTS = 4;
/**
 * Gaps longer than this between samples are integrated as if they were this long: a dropout
 * must not spin the estimate by a whole missing second. A sample stamped before its
 * predecessor (clock glitch) contributes no step at all.
 */
const MAX_STEP_SECONDS = 0.05;

/**
 * The camera's orientation over the whole recording, body frame to world frame, one quaternion
 * per gyro sample. World: y down along gravity, z along the body's forward axis at the start.
 */
export class OrientationTrack {
  private constructor(
    private readonly videoTimes: Float64Array,
    private readonly quaternions: Float32Array,
  ) {
    ensureInvariant(
      quaternions.length === videoTimes.length * QUATERNION_COMPONENTS,
      'orientation track arrays disagree on the sample count',
    );
  }

  /**
   * Integrates the gyro, bias-corrected and pulled towards gravity, from an initial pose that
   * levels the opening window's gravity.
   */
  public static integrate(parts: OrientationTrackParts): OrientationTrack {
    const options = { ...DEFAULT_INTEGRATION_OPTIONS, ...parts.options };
    const { gyro, clock, frame } = parts;
    const videoTimes = new Float64Array(gyro.length);
    const quaternions = new Float32Array(gyro.length * QUATERNION_COMPONENTS);
    if (gyro.isEmpty) return new OrientationTrack(videoTimes, quaternions);
    const bias = estimateGyroBias(gyro, frame, stillestWindow(gyro, frame, options.biasWindow));
    let orientation = initialOrientation(gyro, frame, options.biasWindow);
    let previous = { time: clock.gyroVideoTimeOf(gyro.sampleAt(0).captureTime), rate: ZERO };
    for (let index = 0; index < gyro.length; index += 1) {
      const sample = gyro.sampleAt(index);
      ensureInvariant(
        isFiniteVector(sample.acceleration) && isFiniteVector(sample.angularVelocity),
        `gyro sample ${index} is not finite`,
      );
      const time = clock.gyroVideoTimeOf(sample.captureTime);
      const step = Math.min(Math.max(time - previous.time, 0), MAX_STEP_SECONDS);
      const correction = gravityCorrection(orientation, toBodyFrame(frame, sample.acceleration));
      orientation = advance(
        orientation,
        corrected(previous.rate, correction, options.gravityGain),
        step,
      );
      videoTimes[index] = time;
      quaternions.set(orientation, index * QUATERNION_COMPONENTS);
      previous = { time, rate: withoutBias(toBodyFrame(frame, sample.angularVelocity), bias) };
    }
    return new OrientationTrack(videoTimes, quaternions);
  }

  public get length(): number {
    return this.videoTimes.length;
  }

  public get startTime(): Seconds {
    return seconds(this.videoTimes[0] ?? 0);
  }

  public get endTime(): Seconds {
    return seconds(this.videoTimes.at(-1) ?? 0);
  }

  /**
   * The orientation at a video time, interpolated between samples and held at the ends.
   */
  public orientationAt(videoTime: Seconds): Quaternion {
    if (this.length === 0) return IDENTITY_QUATERNION;
    const after = this.firstIndexAfter(videoTime);
    if (after === 0) return this.quaternionAt(0);
    if (after >= this.length) return this.quaternionAt(this.length - 1);
    const before = after - 1;
    const span = (this.videoTimes[after] ?? 0) - (this.videoTimes[before] ?? 0);
    const fraction = span > 0 ? (videoTime - (this.videoTimes[before] ?? 0)) / span : 0;
    return slerpQuaternions(this.quaternionAt(before), this.quaternionAt(after), fraction);
  }

  private quaternionAt(index: number): Quaternion {
    const base = index * QUATERNION_COMPONENTS;
    const [x = 0, y = 0, z = 0, w = 1] = this.quaternions.subarray(
      base,
      base + QUATERNION_COMPONENTS,
    );
    return [x, y, z, w];
  }

  private firstIndexAfter(videoTime: Seconds): number {
    let low = 0;
    let high = this.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((this.videoTimes[middle] ?? Infinity) <= videoTime) low = middle + 1;
      else high = middle;
    }
    return low;
  }
}

const ZERO: Vector3 = [0, 0, 0];

function withoutBias(rate: Vector3, bias: Vector3): Vector3 {
  return [rate[0] - bias[0], rate[1] - bias[1], rate[2] - bias[2]];
}

/**
 * The gyro rate with the gravity pull added, radians per second in the body frame.
 */
function corrected(rate: Vector3, correction: Vector3, gain: number): Vector3 {
  return [
    rate[0] + gain * correction[0],
    rate[1] + gain * correction[1],
    rate[2] + gain * correction[2],
  ];
}

/**
 * One integration step: the body turns at `rate` for `step` seconds. The rate is the one
 * measured at the start of the interval, so a turn beginning at a sample begins exactly there.
 */
function advance(orientation: Quaternion, rate: Vector3, step: number): Quaternion {
  const rotation: Vector3 = [rate[0] * step, rate[1] * step, rate[2] * step];
  return normalizeQuaternion(
    multiplyQuaternions(orientation, quaternionFromRotationVector(rotation)),
  );
}
