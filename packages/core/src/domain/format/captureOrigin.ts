import type { RecordingInfo } from './info/RecordingInfo';
import type { GyroSampleLayout } from './records/gyro/GyroSampleLayout';
import type { TrimRecord } from './records/trim/parseTrimRecord';
import {
  microseconds,
  secondsToMicroseconds,
  seconds,
  type Microseconds,
  type Seconds,
} from '../../shared/units/time';
import type { ExposureRecord } from '../motion/exposure/ExposureRecord';

/**
 * A capture-clock stamp written outside the gyro record (the first frame's, the exposure
 * entries'), as a time: cameras write them in the gyro layout's unit (milliseconds for the
 * float layout, as telemetry-parser reads them), microseconds without a gyro layout.
 */
export function captureTimeOfStamp(
  stamp: number,
  gyroLayout: GyroSampleLayout | undefined,
): Microseconds {
  return gyroLayout ? gyroLayout.captureTimeOf(stamp) : microseconds(stamp);
}

/**
 * The capture-clock time of the first encoded frame, the origin of video time; undefined when
 * the info record does not say.
 */
export function firstFrameCaptureTime(
  info: RecordingInfo,
  gyroLayout: GyroSampleLayout | undefined,
): Microseconds | undefined {
  const stamp = info.firstFrameTimestamp;
  return stamp === undefined ? undefined : captureTimeOfStamp(stamp, gyroLayout);
}

/**
 * What times the frames of the recording a clip was trimmed from: its exposure record, and the
 * video track's frame duration for when there is no such record.
 */
export interface OriginalFrameTiming {
  readonly exposure: ExposureRecord | undefined;
  readonly frameDuration: Seconds | undefined;
}

/**
 * The capture-clock time of the first frame of a clip the Insta360 app trimmed, which keeps the
 * original's first-frame stamp: the exposure of the frame the clip was cut at, counted from the
 * original's first encoded frame, or that many frame durations later without an exposure record.
 * The original's origin where neither can tell, including an exposure record the cut lies past:
 * the app copies the whole record, so only a bad trim record points there.
 */
export function originOfTrimmedClip(
  originalOrigin: Microseconds,
  trim: TrimRecord,
  timing: OriginalFrameTiming,
): Microseconds {
  const { exposure, frameDuration } = timing;
  if (exposure) return exposureAtCut(exposure, originalOrigin, trim) ?? originalOrigin;
  if (frameDuration === undefined) return originalOrigin;
  const cutAfter = secondsToMicroseconds(seconds(trim.startFrame * frameDuration));
  return microseconds(Math.round(originalOrigin + cutAfter));
}

/**
 * The capture time of the frame the clip was cut at; undefined when the exposure record ends
 * before it.
 */
function exposureAtCut(
  exposure: ExposureRecord,
  originalOrigin: Microseconds,
  trim: TrimRecord,
): Microseconds | undefined {
  const cutAt = exposure.indexAtOrAfter(originalOrigin) + trim.startFrame;
  return cutAt < exposure.length ? exposure.entryAt(cutAt).captureTime : undefined;
}
