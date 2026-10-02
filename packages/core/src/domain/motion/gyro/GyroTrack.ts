import type { ReadonlyFloat64Array } from '../../../shared/binary/ReadonlyTypedArray';
import { ensureIndexInRange, ensureInvariant } from '../../../shared/errors/GyroViewError';
import { VECTOR3_COMPONENTS, type Vector3 } from '../../../shared/math/Vector3';
import { type Microseconds, microseconds } from '../../../shared/units/time';

export interface GyroSample {
  /**
   * Capture-clock time of the sample; the same clock the exposure record and the first frame use.
   */
  readonly captureTime: Microseconds;
  /**
   * Specific force in g.
   */
  readonly acceleration: Vector3;
  /**
   * Angular velocity in radians per second.
   */
  readonly angularVelocity: Vector3;
}

/**
 * Structure-of-arrays storage for a whole recording's IMU samples (a 4-minute X5 clip has a
 * quarter of a million), with a per-sample view for callers that prefer objects. Its times never
 * go back: the orientation lookup searches them and the estimation windows measure them, so
 * recorded stamps come through {@link repairedTimeline}.
 */
export class GyroTrack {
  public constructor(
    private readonly captureTimeStore: Float64Array,
    private readonly accelerationStore: Float32Array,
    private readonly angularVelocityStore: Float32Array,
  ) {
    const expected = captureTimeStore.length * VECTOR3_COMPONENTS;
    ensureInvariant(
      accelerationStore.length === expected && angularVelocityStore.length === expected,
      'gyro track arrays disagree on the sample count',
    );
    ensureInvariant(isNonDecreasing(captureTimeStore), 'gyro sample times go back');
  }

  public get length(): number {
    return this.captureTimeStore.length;
  }

  public get isEmpty(): boolean {
    return this.captureTimeStore.length === 0;
  }

  public get captureTimes(): ReadonlyFloat64Array {
    return this.captureTimeStore;
  }

  /**
   * Mean spacing between consecutive samples, or undefined for fewer than two samples.
   */
  public get meanSampleInterval(): Microseconds | undefined {
    if (this.length < 2) return undefined;
    const span = (this.captureTimeStore[this.length - 1] ?? 0) - (this.captureTimeStore[0] ?? 0);
    return microseconds(span / (this.length - 1));
  }

  public sampleAt(index: number): GyroSample {
    ensureIndexInRange(index, this.length, 'gyro sample');
    return {
      captureTime: microseconds(this.captureTimeStore[index] ?? 0),
      acceleration: this.vectorAt(this.accelerationStore, index),
      angularVelocity: this.vectorAt(this.angularVelocityStore, index),
    };
  }

  /**
   * A sample's angular velocity alone, for the loops over every sample that need nothing else.
   */
  public angularVelocityAt(index: number): Vector3 {
    ensureIndexInRange(index, this.length, 'gyro sample');
    return this.vectorAt(this.angularVelocityStore, index);
  }

  /**
   * The vector at an index already checked.
   */
  private vectorAt(store: Float32Array, index: number): Vector3 {
    const base = index * VECTOR3_COMPONENTS;
    return [store[base] ?? NaN, store[base + 1] ?? NaN, store[base + 2] ?? NaN];
  }
}

function isNonDecreasing(times: Float64Array): boolean {
  return times.every((time, index) => index === 0 || time >= (times[index - 1] ?? time));
}
