import {
  microseconds,
  microsecondsToSeconds,
  milliseconds,
  millisecondsToSeconds,
  seconds,
  type Microseconds,
  type Milliseconds,
  type Seconds,
} from '../../../shared/units/time';

/**
 * Relates the camera's capture clock (microseconds, shared by gyro samples and exposure entries)
 * to video time (seconds from the first encoded frame). The gyro readings lag the frames by the
 * small offset the info record calls `gyro_timestamp`.
 */
export class CaptureClock {
  public constructor(
    public readonly firstFrameTimestamp: Microseconds,
    public readonly gyroOffset: Milliseconds = milliseconds(0),
  ) {}

  public videoTimeOf(timestamp: Microseconds): Seconds {
    return microsecondsToSeconds(microseconds(timestamp - this.firstFrameTimestamp));
  }

  public gyroVideoTimeOf(timestamp: Microseconds): Seconds {
    return seconds(this.videoTimeOf(timestamp) - millisecondsToSeconds(this.gyroOffset));
  }

  public captureTimestampOf(videoTime: Seconds): Microseconds {
    return microseconds(this.firstFrameTimestamp + videoTime * MICROSECONDS_PER_SECOND);
  }
}

const MICROSECONDS_PER_SECOND = 1_000_000;
