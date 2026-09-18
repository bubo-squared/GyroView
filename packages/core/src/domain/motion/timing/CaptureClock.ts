import { GyroViewError } from '../../../shared/errors/GyroViewError';
import {
  microseconds,
  microsecondsToSeconds,
  milliseconds,
  millisecondsToMicroseconds,
  millisecondsToSeconds,
  seconds,
  secondsToMicroseconds,
  type Microseconds,
  type Milliseconds,
  type Seconds,
} from '../../../shared/units/time';
import type { RecordingInfo } from '../../format/info/RecordingInfo';

/**
 * Unit of the capture-clock fields in the info record, which follows the gyro sample layout.
 */
export type CaptureClockUnit = 'microseconds' | 'milliseconds';

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

  /**
   * The only place the info record's raw timestamp fields are converted into branded units.
   */
  public static fromInfo(info: RecordingInfo, unit: CaptureClockUnit): CaptureClock {
    if (info.firstFrameTimestamp === undefined) {
      throw new GyroViewError('no-frame-times', 'the info record has no first frame timestamp');
    }
    const firstFrame =
      unit === 'microseconds'
        ? microseconds(info.firstFrameTimestamp)
        : millisecondsToMicroseconds(milliseconds(info.firstFrameTimestamp));
    return new CaptureClock(firstFrame, milliseconds(info.gyroOffsetMs ?? 0));
  }

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
