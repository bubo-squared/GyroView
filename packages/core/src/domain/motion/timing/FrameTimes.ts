import type { CaptureClock } from './CaptureClock';
import { ensureIndexInRange, ensureInvariant } from '../../../shared/errors/GyroViewError';
import { type Microseconds, microseconds, seconds, type Seconds } from '../../../shared/units/time';
import { clamp } from '../../../shared/math/clamp';

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
  /**
   * Undefined when unknown: the frame is then taken as read out at once.
   */
  readonly readoutTime: Seconds | undefined;
  /**
   * How far apart the track presents its frames, from the first frame's video time on;
   * undefined when the track does not say, and a presented frame is then found by capture time.
   */
  readonly frameDuration: Seconds | undefined;
}

/**
 * A presentation time this small a part of a frame before its frame's still finds that frame:
 * decoders round timestamps to whole microseconds, a sixty-thousandth of a frame at 60 fps.
 */
const GRID_TOLERANCE_FRAMES = 0.01;

/**
 * Capture timing of every encoded frame, in frame order.
 */
export class FrameTimes {
  private readonly readoutTime: Seconds;
  private readonly clock: CaptureClock;
  private readonly captureTimes: Float64Array;
  private readonly shutterTimes: Float64Array | undefined;
  private readonly frameDuration: Seconds | undefined;

  public constructor(parts: FrameTimesParts) {
    ensureInvariant(
      parts.shutterTimes === undefined || parts.shutterTimes.length === parts.captureTimes.length,
      'frame time arrays disagree on the frame count',
    );
    this.clock = parts.clock;
    this.captureTimes = parts.captureTimes;
    this.shutterTimes = parts.shutterTimes;
    this.readoutTime = parts.readoutTime ?? seconds(0);
    this.frameDuration = parts.frameDuration;
  }

  /**
   * Frame times from a source that knows when frames were captured but not for how long.
   */
  public static withoutShutterTimes(parts: Omit<FrameTimesParts, 'shutterTimes'>): FrameTimes {
    return new FrameTimes({ ...parts, shutterTimes: undefined });
  }

  public get frameCount(): number {
    return this.captureTimes.length;
  }

  public frameAt(index: number): FrameTime {
    ensureIndexInRange(index, this.frameCount, 'frame');
    const captureTime = microseconds(this.captureTimes[index] ?? 0);
    const shutter = this.shutterTimes?.[index];
    const shutterTime = shutter === undefined ? undefined : seconds(shutter);
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
   * When to sample the orientation for the frame shown at `videoTime`; undefined when there are
   * no frames.
   */
  public midExposureAt(videoTime: Seconds): Seconds | undefined {
    const index = this.frameIndexAt(videoTime);
    return index === undefined ? undefined : this.frameAt(index).midExposureVideoTime;
  }

  /**
   * Index of the frame the track presents at `videoTime`, clamped to the first and last frame;
   * undefined when there are no frames. Found by its place on the track's frame grid, which
   * neither the camera clock's drift against the track nor timestamps rounded to microseconds
   * move; by capture time only when the track gives no frame spacing.
   */
  public frameIndexAt(videoTime: Seconds): number | undefined {
    if (this.frameCount === 0) return undefined;
    const index =
      this.frameDuration === undefined
        ? this.lastCapturedAt(videoTime)
        : this.onFrameGrid(videoTime, this.frameDuration);
    return clamp(index, 0, this.frameCount - 1);
  }

  private onFrameGrid(videoTime: Seconds, frameDuration: Seconds): number {
    const framesIn = (videoTime - this.clock.firstFrameVideoTime) / frameDuration;
    return Math.floor(framesIn + GRID_TOLERANCE_FRAMES);
  }

  /**
   * The last frame captured at or before `videoTime`.
   */
  private lastCapturedAt(videoTime: Seconds): number {
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
