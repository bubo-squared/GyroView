import { parseExposureRecord } from './exposure/parseExposureRecord';
import type { GyroSampleLayout } from './gyro/GyroSampleLayout';
import {
  GYRO_LAYOUT_PROBE_SIZE,
  parseGyroRecord,
  selectGyroSampleLayout,
  type GyroLayoutHints,
  type ParsedGyroRecord,
} from './gyro/parseGyroRecord';
import { firstFrameCaptureTime } from '../captureOrigin';
import { RecordType } from '../constants';
import type { RecordingInfo } from '../info/RecordingInfo';
import type { RecordLocation } from '../trailer/RecordLocation';
import type { Trailer } from '../trailer/Trailer';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { ensureInvariant } from '../../../shared/errors/GyroViewError';
import type { Microseconds } from '../../../shared/units/time';
import type { ExposureRecord } from '../../motion/exposure/ExposureRecord';

export interface TrailerRecordsParts {
  readonly source: RandomAccessSource;
  readonly trailer: Trailer;
  readonly info: RecordingInfo;
}

/**
 * The large records the trailer lists, read on demand through the source: the gyro record in the
 * sample layout the file actually uses, and the exposure record.
 */
export class TrailerRecords {
  private gyroLayoutPromise: Promise<GyroSampleLayout | undefined> | undefined;

  public constructor(private readonly parts: TrailerRecordsParts) {}

  /**
   * Undefined when the camera wrote no gyro record.
   */
  public async readGyro(): Promise<ParsedGyroRecord | undefined> {
    const location = this.parts.trailer.locationOf(RecordType.Gyro);
    if (location === undefined) return undefined;
    const [payload, layout] = await Promise.all([
      this.parts.source.read(location.payload),
      this.gyroSampleLayout(),
    ]);
    ensureInvariant(layout !== undefined, 'a gyro record always yields or refuses a layout');
    return parseGyroRecord(payload, layout);
  }

  /**
   * Undefined when the camera wrote no exposure record.
   */
  public async readExposure(): Promise<ExposureRecord | undefined> {
    const location = this.parts.trailer.locationOf(RecordType.Exposure);
    return location === undefined
      ? undefined
      : parseExposureRecord(await this.parts.source.read(location.payload));
  }

  /**
   * When the first frame was captured, which the info record stamps in the gyro layout's unit;
   * undefined when it does not say.
   */
  public async firstFrameCaptureTime(): Promise<Microseconds | undefined> {
    return firstFrameCaptureTime(this.parts.info, await this.gyroSampleLayout());
  }

  /**
   * The gyro sample layout the file actually uses: from the info record's flag when present,
   * otherwise inferred from the first bytes of the gyro record, which may refuse to tell.
   * Undefined without a gyro record and without the flag.
   */
  private gyroSampleLayout(): Promise<GyroSampleLayout | undefined> {
    this.gyroLayoutPromise ??= this.selectGyroLayout();
    return this.gyroLayoutPromise;
  }

  private async selectGyroLayout(): Promise<GyroSampleLayout | undefined> {
    const hints = this.gyroLayoutHints();
    if (hints.isRawGyro !== undefined) return selectGyroSampleLayout(hints, undefined);
    const location = this.parts.trailer.locationOf(RecordType.Gyro);
    const head = location === undefined ? undefined : await this.readHeadOf(location);
    return selectGyroSampleLayout(hints, head);
  }

  private gyroLayoutHints(): GyroLayoutHints {
    return { isRawGyro: this.parts.info.isRawGyro, ranges: this.parts.info.sensorRanges };
  }

  private readHeadOf(location: RecordLocation): Promise<Uint8Array> {
    const length = Math.min(GYRO_LAYOUT_PROBE_SIZE, location.payload.length);
    return this.parts.source.read(ByteRange.of(location.payload.offset, length));
  }
}
