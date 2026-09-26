import type { CaptureClock } from './CaptureClock';
import { ensureIndexInRange, ensureInvariant } from '../../../shared/errors/GyroViewError';
import { seconds, type Microseconds, type Seconds } from '../../../shared/units/time';

export interface FrameTime {
  readonly index: number;
  readonly captureTime: Microseconds;
  readonly videoTime: Seconds;
  /**
   * Undefined when the source of the frame times does not know the shutter duration.
   */
  readonly shutterTime: Seconds | undefined;
  /**
   * Instant to sample the gyro orientation for this frame: half way through the exposure and
   * half way through the rolling-shutter readout. Uses a zero shutter time when it is unknown.
   */
  readonly midExposureVideoTime: Seconds;
}

export interface FrameTimesParts {
  readonly clock: CaptureClock;
  readonly captureTimes: Float64Array;
  readonly shutterTimes: Float64Array | undefined;
  readonly readoutTime: Seconds;
}

/**
 * Capture timing of every encoded frame, in frame order.
 */
export class FrameTimes {
  public readonly readoutTime: Seconds;
  private readonly clock: CaptureClock;
  private readonly captureTimes: Float64Array;
  private readonly shutterTimes: Float64Array | undefined;

  public constructor(parts: FrameTimesParts) {
    ensureInvariant(
      parts.shutterTimes === undefined || parts.shutterTimes.length === parts.captureTimes.length,
      'frame time arrays disagree on the frame count',
    );
    this.clock = parts.clock;
    this.captureTimes = parts.captureTimes;
    this.shutterTimes = parts.shutterTimes;
    this.readoutTime = parts.readoutTime;
  }

  /**
   * Frame times from a source that knows when frames were captured but not for how long.
   */
  public static withoutShutterTimes(
    clock: CaptureClock,
    captureTimes: Float64Array,
    readoutTime: Seconds,
  ): FrameTimes {
    return new FrameTimes({ clock, captureTimes, shutterTimes: undefined, readoutTime });
  }

  public get frameCount(): number {
    return this.captureTimes.length;
  }

  public frameAt(index: number): FrameTime {
    ensureIndexInRange(index, this.frameCount, 'frame');
    const captureTime = this.captureTimes[index] as Microseconds;
    const shutterTime = this.shutterTimes?.[index] as Seconds | undefined;
    const videoTime = this.clock.videoTimeOf(captureTime);
    return {
      index,
      captureTime,
      videoTime,
      shutterTime,
      midExposureVideoTime: seconds(videoTime + (shutterTime ?? 0) / 2 + this.readoutTime / 2),
    };
  }

  /**
   * Index of the frame shown at `videoTime`: the last frame captured at or before it, clamped
   * to the first and last frame. Undefined when there are no frames.
   */
  public frameIndexAt(videoTime: Seconds): number | undefined {
    if (this.frameCount === 0) return undefined;
    const target = this.clock.captureTimeOf(videoTime);
    let low = 0;
    let high = this.frameCount - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.captureTimes[middle] ?? Infinity) <= target) low = middle;
      else high = middle - 1;
    }
    return low;
  }
}
