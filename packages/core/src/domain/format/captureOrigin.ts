import type { RecordingInfo } from './info/RecordingInfo';
import type { GyroSampleLayout } from './records/gyro/GyroSampleLayout';
import type { TrimRecord } from './records/trim/parseTrimRecord';
import {
  microseconds,
  secondsToMicroseconds,
  seconds,
  type Microseconds,
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
 * What times the frames of the recording a clip was trimmed from: its exposure record, and its
 * nominal frame rate for where that record does not reach.
 */
export interface OriginalFrameTiming {
  readonly exposure: ExposureRecord | undefined;
  readonly frameRate: number | undefined;
}

/**
 * The capture-clock time of the first frame of a clip the Insta360 app trimmed, which keeps the
 * original's first-frame stamp: the exposure of the frame the clip was cut at, counted from the
 * original's first encoded frame, or that many frames at the nominal rate where the exposure
 * record does not reach it. The original's origin where neither can tell.
 */
export function originOfTrimmedClip(
  originalOrigin: Microseconds,
  trim: TrimRecord,
  timing: OriginalFrameTiming,
): Microseconds {
  const { exposure, frameRate } = timing;
  const cutAt = exposure ? exposure.indexAtOrAfter(originalOrigin) + trim.startFrame : Infinity;
  if (exposure && cutAt < exposure.length) return exposure.entryAt(cutAt).captureTime;
  if (frameRate === undefined || frameRate <= 0) return originalOrigin;
  const cutAfter = secondsToMicroseconds(seconds(trim.startFrame / frameRate));
  return microseconds(Math.round(originalOrigin + cutAfter));
}
