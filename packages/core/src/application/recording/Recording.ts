import type { CalibrationChoice } from '../../domain/format/calibration/selectCalibration';
import type { RecordingInfo } from '../../domain/format/info/RecordingInfo';
import type { ParsedGyroRecord } from '../../domain/format/records/gyro/parseGyroRecord';
import type { ExposureRecord } from '../../domain/motion/exposure/ExposureRecord';
import type { CaptureClock } from '../../domain/motion/timing/CaptureClock';

/**
 * Everything known about one `.insv` file after reading its metadata, plus on-demand access to
 * the large records. Video track details arrive later from the demuxer port.
 */
export interface Recording {
  readonly info: RecordingInfo;
  readonly calibration: CalibrationChoice;
  /**
   * Whether the camera wrote an exposure record, whether or not it reads: what tells a damaged
   * record from none.
   */
  readonly listsExposureRecord: boolean;
  /**
   * The camera's capture clock related to video time; undefined when the info record does not
   * say when the first frame was captured, the one field everything time-related hangs on.
   */
  captureClock(): Promise<CaptureClock | undefined>;
  /**
   * Undefined when the camera wrote no gyro record.
   */
  readGyroRecord(): Promise<ParsedGyroRecord | undefined>;
  /**
   * Undefined when the camera wrote no exposure record, or a damaged one.
   */
  readExposureRecord(): Promise<ExposureRecord | undefined>;
}
