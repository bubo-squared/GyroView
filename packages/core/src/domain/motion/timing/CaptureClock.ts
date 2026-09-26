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
 * to video time (seconds on the video track, where the first encoded frame shows at
 * `firstFrameVideoTime`). Gyro samples are stamped a little later than the frames they belong
 * to; that gyro offset is subtracted for them.
 */
export class CaptureClock {
  public constructor(
    public readonly firstFrameCaptureTime: Microseconds,
    public readonly gyroOffset: Milliseconds = milliseconds(0),
    /**
     * Zero unless an edit list starts the track later.
     */
    public readonly firstFrameVideoTime: Seconds = seconds(0),
  ) {}

  /**
   * The same clock for a track whose first frame shows at `videoTime`, so frame times and the
   * orientation share the time base of the frames the decoder delivers.
   */
  public withFirstFrameAt(videoTime: Seconds): CaptureClock {
    return new CaptureClock(this.firstFrameCaptureTime, this.gyroOffset, videoTime);
  }

  public videoTimeOf(captureTime: Microseconds): Seconds {
    const sinceFirstFrame = microseconds(captureTime - this.firstFrameCaptureTime);
    return seconds(this.firstFrameVideoTime + microsecondsToSeconds(sinceFirstFrame));
  }

  public gyroVideoTimeOf(captureTime: Microseconds): Seconds {
    return seconds(this.videoTimeOf(captureTime) - millisecondsToSeconds(this.gyroOffset));
  }

  /**
   * Inverse of {@link videoTimeOf}, rounded to whole microseconds like the camera's clock.
   */
  public captureTimeOf(videoTime: Seconds): Microseconds {
    const sinceFirstFrame = secondsToMicroseconds(seconds(videoTime - this.firstFrameVideoTime));
    return microseconds(Math.round(this.firstFrameCaptureTime + sinceFirstFrame));
  }
}
