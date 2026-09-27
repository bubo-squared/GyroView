import type { CalibrationChoice } from '../../domain/format/calibration/selectCalibration';
import type { RecordingInfo } from '../../domain/format/info/RecordingInfo';
import type { ParsedGyroRecord } from '../../domain/format/records/gyro/parseGyroRecord';
import type { TrailerRecords } from '../../domain/format/records/TrailerRecords';
import type { ExposureRecord } from '../../domain/motion/exposure/ExposureRecord';
import { CaptureClock } from '../../domain/motion/timing/CaptureClock';

export interface RecordingParts {
  readonly info: RecordingInfo;
  readonly calibration: CalibrationChoice;
  readonly records: TrailerRecords;
}

/**
 * Everything known about one `.insv` file after reading its metadata, plus on-demand access to
 * the large records. Video track details arrive later from the demuxer port.
 */
export class Recording {
  public constructor(private readonly parts: RecordingParts) {}

  public get info(): RecordingInfo {
    return this.parts.info;
  }

  public get calibration(): CalibrationChoice {
    return this.parts.calibration;
  }

  /**
   * Whether the camera wrote an exposure record, whether or not it reads: what tells a damaged
   * record from none.
   */
  public get listsExposureRecord(): boolean {
    return this.parts.records.listsExposure;
  }

  /**
   * The camera's capture clock related to video time; undefined when the info record does not
   * say when the first frame was captured, the one field everything time-related hangs on.
   */
  public async captureClock(): Promise<CaptureClock | undefined> {
    const origin = await this.parts.records.firstFrameCaptureTime();
    return origin === undefined ? undefined : new CaptureClock(origin, this.parts.info.gyroOffset);
  }

  /**
   * Undefined when the camera wrote no gyro record.
   */
  public readGyroRecord(): Promise<ParsedGyroRecord | undefined> {
    return this.parts.records.readGyro();
  }

  /**
   * Undefined when the camera wrote no exposure record, or a damaged one.
   */
  public readExposureRecord(): Promise<ExposureRecord | undefined> {
    return this.parts.records.readExposure();
  }
}
