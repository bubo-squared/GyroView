import type { Vector3 } from '../../../shared/math/Vector3';
import type { Microseconds } from '../../../shared/units/time';

const COMPONENTS = 3;

export interface GyroSample {
  /**
   * Capture-clock time of the sample; the same clock the exposure record and
   * `first_frame_timestamp` use.
   */
  readonly timestamp: Microseconds;
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
 * quarter of a million), with a per-sample view for callers that prefer objects.
 */
export class GyroTrack {
  public constructor(
    public readonly timestamps: Float64Array,
    public readonly accelerations: Float32Array,
    public readonly angularVelocities: Float32Array,
  ) {
    if (
      accelerations.length !== timestamps.length * COMPONENTS ||
      angularVelocities.length !== timestamps.length * COMPONENTS
    ) {
      throw new RangeError('gyro track arrays disagree on the sample count');
    }
  }

  public get length(): number {
    return this.timestamps.length;
  }

  public get isEmpty(): boolean {
    return this.timestamps.length === 0;
  }

  /**
   * Mean spacing between consecutive samples, or undefined for fewer than two samples.
   */
  public get meanSampleInterval(): Microseconds | undefined {
    if (this.length < 2) return undefined;
    const first = this.timestamps[0] ?? 0;
    const last = this.timestamps[this.length - 1] ?? 0;
    return ((last - first) / (this.length - 1)) as Microseconds;
  }

  public sampleAt(index: number): GyroSample {
    const base = index * COMPONENTS;
    return {
      timestamp: this.timestamps[index] as Microseconds,
      acceleration: [
        this.accelerations[base] ?? 0,
        this.accelerations[base + 1] ?? 0,
        this.accelerations[base + 2] ?? 0,
      ],
      angularVelocity: [
        this.angularVelocities[base] ?? 0,
        this.angularVelocities[base + 1] ?? 0,
        this.angularVelocities[base + 2] ?? 0,
      ],
    };
  }
}
