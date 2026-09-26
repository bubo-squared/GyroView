import type { RecordingInfo } from './info/RecordingInfo';
import type { GyroSampleLayout } from './records/gyro/GyroSampleLayout';
import { microseconds, type Microseconds } from '../../shared/units/time';

/**
 * The capture-clock time of the first encoded frame, the origin of video time. The info record
 * stamps it in the gyro layout's unit; a camera without a gyro layout stamps microseconds.
 * Undefined when the record does not say.
 */
export function firstFrameCaptureTime(
  info: RecordingInfo,
  gyroLayout: GyroSampleLayout | undefined,
): Microseconds | undefined {
  const stamp = info.firstFrameTimestamp;
  if (stamp === undefined) return undefined;
  return gyroLayout ? gyroLayout.captureTimeOf(stamp) : microseconds(stamp);
}
