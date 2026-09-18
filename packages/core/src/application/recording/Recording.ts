import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import type { BoxLayout } from '../../domain/format/boxes/BoxLayout';
import { BoxType } from '../../domain/format/boxes/boxConstants';
import { findBox } from '../../domain/format/boxes/BoxLayout';
import { RecordType } from '../../domain/format/constants';
import type { RecordingInfo } from '../../domain/format/info/RecordingInfo';
import type { Trailer } from '../../domain/format/trailer/Trailer';
import type { ExposureRecord } from '../../domain/motion/exposure/ExposureRecord';
import type { ExposureRecordParser } from '../../domain/motion/exposure/ExposureRecordParser';
import type { GyroRecordParser } from '../../domain/motion/gyro/GyroRecordParser';
import type { GyroTrack } from '../../domain/motion/gyro/GyroTrack';
import type { CalibrationChoice } from '../../domain/optics/CalibrationSelector';

export type TrailerWrapper = 'inst-box' | 'bare';

export interface RecordingParts {
  readonly source: RandomAccessSource;
  readonly boxes: BoxLayout;
  readonly trailer: Trailer;
  readonly info: RecordingInfo;
  readonly calibration: CalibrationChoice;
  readonly gyroParser: GyroRecordParser;
  readonly exposureParser: ExposureRecordParser;
}

/**
 * Everything known about one `.insv` file after reading its metadata, plus on-demand access to
 * the large records. Video track details arrive later from the demuxer port.
 */
export class Recording {
  public constructor(private readonly parts: RecordingParts) {}

  public get boxes(): BoxLayout {
    return this.parts.boxes;
  }

  public get trailer(): Trailer {
    return this.parts.trailer;
  }

  public get info(): RecordingInfo {
    return this.parts.info;
  }

  public get calibration(): CalibrationChoice {
    return this.parts.calibration;
  }

  public get trailerWrapper(): TrailerWrapper {
    return findBox(this.parts.boxes, BoxType.Insta360Trailer) ? 'inst-box' : 'bare';
  }

  /**
   * Undefined when the camera wrote no gyro record.
   */
  public async readGyroTrack(): Promise<GyroTrack | undefined> {
    if (!this.parts.trailer.has(RecordType.Gyro)) return undefined;
    const payload = await this.parts.trailer.readRecord(this.parts.source, RecordType.Gyro);
    return this.parts.gyroParser.parse(payload, {
      isRawGyro: this.parts.info.isRawGyro,
      ranges: {
        accelerometerG: this.parts.info.sensorRanges?.accelerometerG,
        gyroscopeDps: this.parts.info.sensorRanges?.gyroscopeDps,
      },
    });
  }

  /**
   * Undefined when the camera wrote no exposure record.
   */
  public async readExposureRecord(): Promise<ExposureRecord | undefined> {
    if (!this.parts.trailer.has(RecordType.Exposure)) return undefined;
    const payload = await this.parts.trailer.readRecord(this.parts.source, RecordType.Exposure);
    return this.parts.exposureParser.parse(payload);
  }
}
