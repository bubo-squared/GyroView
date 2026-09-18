import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import type { BoxDescriptor, TrailerWrapper } from '../../domain/format/boxes/BoxLayout';
import { RecordType } from '../../domain/format/constants';
import type { RecordingInfo } from '../../domain/format/info/RecordingInfo';
import type { LayoutHints } from '../../domain/format/layout/detectLensLayout';
import { parseExposureRecord } from '../../domain/format/records/exposure/parseExposureRecord';
import {
  parseGyroRecord,
  type ParsedGyroRecord,
} from '../../domain/format/records/gyro/parseGyroRecord';
import type { Trailer } from '../../domain/format/trailer/Trailer';
import type { ExposureRecord } from '../../domain/motion/exposure/ExposureRecord';
import { CaptureClock, type CaptureClockUnit } from '../../domain/motion/timing/CaptureClock';
import type { CalibrationChoice } from '../../domain/optics/selectCalibration';

export interface RecordSummary {
  readonly id: number;
  readonly format: number;
  readonly offset: number;
  readonly size: number;
}

export interface RecordingParts {
  readonly source: RandomAccessSource;
  readonly boxes: readonly BoxDescriptor[];
  readonly trailerWrapper: TrailerWrapper;
  readonly trailer: Trailer;
  readonly info: RecordingInfo;
  readonly calibration: CalibrationChoice;
}

/**
 * Everything known about one `.insv` file after reading its metadata, plus on-demand access to
 * the large records. Video track details arrive later from the demuxer port.
 */
export class Recording {
  public constructor(private readonly parts: RecordingParts) {}

  public get boxes(): readonly BoxDescriptor[] {
    return this.parts.boxes;
  }

  public get trailerWrapper(): TrailerWrapper {
    return this.parts.trailerWrapper;
  }

  public get trailerVersion(): number {
    return this.parts.trailer.footer.version;
  }

  public get trailerPayloadStart(): number {
    return this.parts.trailer.payloadStart;
  }

  public get info(): RecordingInfo {
    return this.parts.info;
  }

  public get calibration(): CalibrationChoice {
    return this.parts.calibration;
  }

  public get layoutHints(): LayoutHints {
    return { fileLayout: this.parts.info.fileLayout };
  }

  /**
   * Unit of the info record's capture-clock fields: microseconds unless the camera declares the
   * float gyro layout, whose timestamps are milliseconds.
   */
  public get captureClockUnit(): CaptureClockUnit {
    return this.parts.info.isRawGyro === false ? 'milliseconds' : 'microseconds';
  }

  public captureClock(): CaptureClock {
    return CaptureClock.fromInfo(this.parts.info, this.captureClockUnit);
  }

  public recordSummaries(): readonly RecordSummary[] {
    return this.parts.trailer.records
      .map((record) => ({
        id: record.id,
        format: record.format,
        offset: record.payload.offset,
        size: record.payload.length,
      }))
      .toSorted((left, right) => left.id - right.id);
  }

  /**
   * Undefined when the camera wrote no gyro record.
   */
  public async readGyroRecord(): Promise<ParsedGyroRecord | undefined> {
    const location = this.parts.trailer.locationOf(RecordType.Gyro);
    return location === undefined
      ? undefined
      : parseGyroRecord(await this.parts.source.read(location.payload), {
          isRawGyro: this.parts.info.isRawGyro,
          ranges: this.parts.info.sensorRanges,
        });
  }

  /**
   * Undefined when the camera wrote no exposure record.
   */
  public async readExposureRecord(): Promise<ExposureRecord | undefined> {
    const location = this.parts.trailer.locationOf(RecordType.Exposure);
    return location === undefined
      ? undefined
      : parseExposureRecord(await this.parts.source.read(location.payload)).record;
  }
}
