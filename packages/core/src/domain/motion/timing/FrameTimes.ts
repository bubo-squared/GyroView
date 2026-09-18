import type { CaptureClock } from './CaptureClock';
import { seconds, type Microseconds, type Seconds } from '../../../shared/units/time';

export interface FrameTime {
  readonly index: number;
  readonly captureTimestamp: Microseconds;
  readonly videoTime: Seconds;
  readonly exposure: Seconds;
  /**
   * Instant to sample the gyro orientation for this frame: half way through exposure and
   * half way through the rolling-shutter readout.
   */
  readonly midExposureVideoTime: Seconds;
}

export interface FrameTimesParts {
  readonly clock: CaptureClock;
  readonly captureTimestamps: Float64Array;
  readonly exposures: Float64Array;
  readonly readout: Seconds;
}

/**
 * Capture timing of every encoded frame, in frame order.
 */
export class FrameTimes {
  public readonly readout: Seconds;
  private readonly clock: CaptureClock;
  private readonly captureTimestamps: Float64Array;
  private readonly exposures: Float64Array;

  public constructor(parts: FrameTimesParts) {
    if (parts.captureTimestamps.length !== parts.exposures.length) {
      throw new RangeError('frame time arrays disagree on the frame count');
    }
    this.clock = parts.clock;
    this.captureTimestamps = parts.captureTimestamps;
    this.exposures = parts.exposures;
    this.readout = parts.readout;
  }

  public get frameCount(): number {
    return this.captureTimestamps.length;
  }

  public frameAt(index: number): FrameTime {
    const captureTimestamp = (this.captureTimestamps[index] ?? NaN) as Microseconds;
    const exposure = (this.exposures[index] ?? NaN) as Seconds;
    const videoTime = this.clock.videoTimeOf(captureTimestamp);
    return {
      index,
      captureTimestamp,
      videoTime,
      exposure,
      midExposureVideoTime: seconds(videoTime + exposure / 2 + this.readout / 2),
    };
  }

  /**
   * Index of the frame shown at `videoTime`: the last frame whose capture time is at or before
   * it, clamped to the first and last frame.
   */
  public frameIndexAt(videoTime: Seconds): number {
    const target = this.clock.captureTimestampOf(videoTime);
    let low = 0;
    let high = this.captureTimestamps.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.captureTimestamps[middle] ?? Infinity) <= target) low = middle;
      else high = middle - 1;
    }
    return low;
  }
}
