import type { RecordingInfo } from './info/RecordingInfo';
import type { GyroSampleLayout } from './records/gyro/GyroSampleLayout';
import { microseconds, type Microseconds } from '../../shared/units/time';

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
