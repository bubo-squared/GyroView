import { parseExposureRecord } from './exposure/parseExposureRecord';
import type { GyroSampleLayout } from './gyro/GyroSampleLayout';
import {
  GYRO_LAYOUT_PROBE_SIZE,
  parseGyroRecord,
  selectGyroSampleLayout,
  type GyroLayoutHints,
  type ParsedGyroRecord,
} from './gyro/parseGyroRecord';
import { captureTimeOfStamp, firstFrameCaptureTime } from '../captureOrigin';
import { RecordType } from '../constants';
import type { RecordingInfo } from '../info/RecordingInfo';
import type { RecordLocation } from '../trailer/RecordLocation';
import type { Trailer } from '../trailer/Trailer';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { ensureInvariant } from '../../../shared/errors/GyroViewError';
import type { Microseconds } from '../../../shared/units/time';
import type { ExposureRecord } from '../../motion/exposure/ExposureRecord';

/**
 * The large records the trailer lists, read on demand through the source: the gyro record in the
 * sample layout the file actually uses, and the exposure record.
 */
export class TrailerRecords {
  private gyroLayoutPromise: Promise<GyroSampleLayout | undefined> | undefined;

  public constructor(
    private readonly source: RandomAccessSource,
    private readonly trailer: Trailer,
    private readonly info: RecordingInfo,
  ) {}

  /**
   * Whether the trailer lists an exposure record, parsed or not.
   */
  public get listsExposure(): boolean {
    return this.trailer.locationOf(RecordType.Exposure) !== undefined;
  }

  /**
   * Undefined when the camera wrote no gyro record.
   */
  public async readGyro(): Promise<ParsedGyroRecord | undefined> {
    const location = this.trailer.locationOf(RecordType.Gyro);
    if (location === undefined) return undefined;
    const [payload, layout] = await Promise.all([
      this.source.read(location.payload),
      this.gyroSampleLayout(),
    ]);
    ensureInvariant(layout !== undefined, 'a gyro record always yields or refuses a layout');
    return parseGyroRecord(payload, layout);
  }

  /**
   * Undefined when the camera wrote no exposure record, or a damaged one. Its stamps are in the
   * gyro layout's unit, so a layout that cannot be told refuses it as it refuses the gyro record.
   */
  public async readExposure(): Promise<ExposureRecord | undefined> {
    const location = this.trailer.locationOf(RecordType.Exposure);
    if (location === undefined) return undefined;
    const [payload, layout] = await Promise.all([
      this.source.read(location.payload),
      this.gyroSampleLayout(),
    ]);
    return parseExposureRecord(payload, (stamp) => captureTimeOfStamp(stamp, layout));
  }

  /**
   * When the first frame was captured, which the info record stamps in the gyro layout's unit;
   * undefined when it does not say.
   */
  public async firstFrameCaptureTime(): Promise<Microseconds | undefined> {
    return firstFrameCaptureTime(this.info, await this.gyroSampleLayout());
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
    const location = this.trailer.locationOf(RecordType.Gyro);
    const head = location === undefined ? undefined : await this.readHeadOf(location);
    return selectGyroSampleLayout(hints, head);
  }

  private gyroLayoutHints(): GyroLayoutHints {
    return { isRawGyro: this.info.isRawGyro, ranges: this.info.sensorRanges };
  }

  private readHeadOf(location: RecordLocation): Promise<Uint8Array> {
    const length = Math.min(GYRO_LAYOUT_PROBE_SIZE, location.payload.length);
    return this.source.read(ByteRange.of(location.payload.offset, length));
  }
}
