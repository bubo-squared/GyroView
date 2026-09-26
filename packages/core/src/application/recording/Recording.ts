import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import type { BoxDescriptor, TrailerWrapper } from '../../domain/format/boxes/BoxLayout';
import { RecordType } from '../../domain/format/constants';
import type { RecordingInfo } from '../../domain/format/info/RecordingInfo';
import type { LayoutHints } from '../../domain/format/layout/detectLensLayout';
import { parseExposureRecord } from '../../domain/format/records/exposure/parseExposureRecord';
import {
  GYRO_LAYOUT_PROBE_SIZE,
  inferGyroLayout,
  parseGyroRecord,
  type GyroLayoutName,
  type ParsedGyroRecord,
} from '../../domain/format/records/gyro/parseGyroRecord';
import type { RecordLocation } from '../../domain/format/trailer/RecordLocation';
import type { Trailer } from '../../domain/format/trailer/Trailer';
import type { ExposureRecord } from '../../domain/motion/exposure/ExposureRecord';
import { CaptureClock, type CaptureClockUnit } from '../../domain/motion/timing/CaptureClock';
import type { CalibrationChoice } from '../../domain/optics/selectCalibration';
import { ByteRange } from '../../shared/binary/ByteRange';

export interface RecordingParts {
  readonly source: RandomAccessSource;
  readonly fileSize: number;
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
  private gyroLayoutPromise: Promise<GyroLayoutName | undefined> | undefined;

  public constructor(private readonly parts: RecordingParts) {}

  public get fileSize(): number {
    return this.parts.fileSize;
  }

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
    return { fileLayout: this.parts.info.fileLayout, trackOrder: this.parts.info.trackOrder };
  }

  /**
   * The gyro sample layout the file actually uses: from the info record's flag when present,
   * otherwise inferred from the first bytes of the gyro record. Undefined without a gyro record
   * and without the flag.
   */
  public gyroLayout(): Promise<GyroLayoutName | undefined> {
    this.gyroLayoutPromise ??= this.resolveGyroLayout();
    return this.gyroLayoutPromise;
  }

  /**
   * Unit of the info record's capture-clock fields, which follows the gyro layout: the float
   * layout stamps in milliseconds, the raw layout (and cameras without gyro) in microseconds.
   */
  public async captureClockUnit(): Promise<CaptureClockUnit> {
    return (await this.gyroLayout()) === 'float' ? 'milliseconds' : 'microseconds';
  }

  public async captureClock(): Promise<CaptureClock> {
    return CaptureClock.fromInfo(this.parts.info, await this.captureClockUnit());
  }

  /**
   * Every record the trailer lists, by id.
   */
  public recordLocations(): readonly RecordLocation[] {
    return this.parts.trailer.records.toSorted((left, right) => left.id - right.id);
  }

  /**
   * Undefined when the camera wrote no gyro record.
   */
  public async readGyroRecord(): Promise<ParsedGyroRecord | undefined> {
    const location = this.parts.trailer.locationOf(RecordType.Gyro);
    if (location === undefined) return undefined;
    const layout = await this.gyroLayout();
    return parseGyroRecord(await this.parts.source.read(location.payload), {
      isRawGyro: layout === undefined ? undefined : layout === 'raw',
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

  private async resolveGyroLayout(): Promise<GyroLayoutName | undefined> {
    const { isRawGyro } = this.parts.info;
    if (isRawGyro !== undefined) return isRawGyro ? 'raw' : 'float';
    const location = this.parts.trailer.locationOf(RecordType.Gyro);
    return location === undefined
      ? undefined
      : inferGyroLayout(await this.readHeadOf(location), undefined);
  }

  private readHeadOf(location: RecordLocation): Promise<Uint8Array> {
    const length = Math.min(GYRO_LAYOUT_PROBE_SIZE, location.payload.length);
    return this.parts.source.read(ByteRange.of(location.payload.offset, length));
  }
}
