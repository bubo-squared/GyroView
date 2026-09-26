import {
  microseconds,
  microsecondsToSeconds,
  milliseconds,
  millisecondsToSeconds,
  seconds,
  secondsToMicroseconds,
  type Microseconds,
  type Milliseconds,
  type Seconds,
} from '../../../shared/units/time';

/**
 * Relates the camera's capture clock (microseconds, shared by gyro samples and exposure entries)
 * to video time (seconds from the first encoded frame). Gyro samples are stamped a little later
 * than the frames they belong to; that gyro offset is subtracted for them.
 */
export class CaptureClock {
  public constructor(
    public readonly firstFrameCaptureTime: Microseconds,
    public readonly gyroOffset: Milliseconds = milliseconds(0),
  ) {}

  public videoTimeOf(captureTime: Microseconds): Seconds {
    return microsecondsToSeconds(microseconds(captureTime - this.firstFrameCaptureTime));
  }

  public gyroVideoTimeOf(captureTime: Microseconds): Seconds {
    return seconds(this.videoTimeOf(captureTime) - millisecondsToSeconds(this.gyroOffset));
  }

  /**
   * Inverse of {@link videoTimeOf}, rounded to whole microseconds like the camera's clock.
   */
  public captureTimeOf(videoTime: Seconds): Microseconds {
    return microseconds(Math.round(this.firstFrameCaptureTime + secondsToMicroseconds(videoTime)));
  }
}
