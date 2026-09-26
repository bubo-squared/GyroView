import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import type { BoxDescriptor, TrailerWrapper } from '../../domain/format/boxes/BoxLayout';
import { RecordType } from '../../domain/format/constants';
import type { RecordingInfo } from '../../domain/format/info/RecordingInfo';
import type { LayoutHints } from '../../domain/format/layout/detectLensLayout';
import { parseExposureRecord } from '../../domain/format/records/exposure/parseExposureRecord';
import { firstFrameCaptureTime } from '../../domain/format/captureOrigin';
import type { GyroSampleLayout } from '../../domain/format/records/gyro/GyroSampleLayout';
import {
  GYRO_LAYOUT_PROBE_SIZE,
  parseGyroRecord,
  selectGyroSampleLayout,
  type GyroLayoutHints,
  type ParsedGyroRecord,
} from '../../domain/format/records/gyro/parseGyroRecord';
import type { RecordLocation } from '../../domain/format/trailer/RecordLocation';
import type { Trailer } from '../../domain/format/trailer/Trailer';
import type { ExposureRecord } from '../../domain/motion/exposure/ExposureRecord';
import { CaptureClock } from '../../domain/motion/timing/CaptureClock';
import type { CalibrationChoice } from '../../domain/optics/selectCalibration';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ensureInvariant } from '../../shared/errors/GyroViewError';

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
  private gyroLayoutPromise: Promise<GyroSampleLayout | undefined> | undefined;

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
  public gyroSampleLayout(): Promise<GyroSampleLayout | undefined> {
    this.gyroLayoutPromise ??= this.selectGyroLayout();
    return this.gyroLayoutPromise;
  }

  /**
   * The camera's capture clock related to video time; undefined when the info record does not
   * say when the first frame was captured, the one field everything time-related hangs on.
   */
  public async captureClock(): Promise<CaptureClock | undefined> {
    const { info } = this.parts;
    const origin = firstFrameCaptureTime(info, await this.gyroSampleLayout());
    return origin === undefined ? undefined : new CaptureClock(origin, info.gyroOffset);
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
    const payload = await this.parts.source.read(location.payload);
    const layout = await this.gyroSampleLayout();
    return parseGyroRecord(payload, layout ?? this.layoutHintedBy(payload));
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

  private async selectGyroLayout(): Promise<GyroSampleLayout | undefined> {
    const hints = this.gyroLayoutHints();
    if (hints.isRawGyro !== undefined) return selectGyroSampleLayout(hints, undefined);
    const location = this.parts.trailer.locationOf(RecordType.Gyro);
    const head = location === undefined ? undefined : await this.readHeadOf(location);
    return selectGyroSampleLayout(hints, head);
  }

  /**
   * A record the layout could not be selected for before reading it names its own layout.
   */
  private layoutHintedBy(payload: Uint8Array): GyroSampleLayout {
    const layout = selectGyroSampleLayout(this.gyroLayoutHints(), payload);
    ensureInvariant(layout !== undefined, 'a gyro record always yields a sample layout');
    return layout;
  }

  private gyroLayoutHints(): GyroLayoutHints {
    return { isRawGyro: this.parts.info.isRawGyro, ranges: this.parts.info.sensorRanges };
  }

  private readHeadOf(location: RecordLocation): Promise<Uint8Array> {
    const length = Math.min(GYRO_LAYOUT_PROBE_SIZE, location.payload.length);
    return this.parts.source.read(ByteRange.of(location.payload.offset, length));
  }
}
