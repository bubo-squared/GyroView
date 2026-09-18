import { Recording } from './Recording';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import { BoxScanner } from '../../domain/format/boxes/BoxScanner';
import { RecordType } from '../../domain/format/constants';
import { InfoRecordParser } from '../../domain/format/info/InfoRecordParser';
import type { Trailer } from '../../domain/format/trailer/Trailer';
import { TrailerReader } from '../../domain/format/trailer/TrailerReader';
import { ExposureRecordParser } from '../../domain/motion/exposure/ExposureRecordParser';
import { GyroRecordParser } from '../../domain/motion/gyro/GyroRecordParser';
import { CalibrationSelector } from '../../domain/optics/CalibrationSelector';
import { GyroViewError } from '../../shared/errors/GyroViewError';

export interface RecordingReaderDependencies {
  readonly boxScanner: BoxScanner;
  readonly trailerReader: TrailerReader;
  readonly infoRecordParser: InfoRecordParser;
  readonly calibrationSelector: CalibrationSelector;
  readonly gyroRecordParser: GyroRecordParser;
  readonly exposureRecordParser: ExposureRecordParser;
}

export function defaultRecordingReaderDependencies(): RecordingReaderDependencies {
  return {
    boxScanner: new BoxScanner(),
    trailerReader: new TrailerReader(),
    infoRecordParser: new InfoRecordParser(),
    calibrationSelector: new CalibrationSelector(),
    gyroRecordParser: new GyroRecordParser(),
    exposureRecordParser: new ExposureRecordParser(),
  };
}

/**
 * Use case: open a source and read everything needed to describe the recording, with the
 * minimum of I/O (box headers, trailer table of contents, info record).
 */
export class RecordingReader {
  public constructor(
    private readonly dependencies: RecordingReaderDependencies = defaultRecordingReaderDependencies(),
  ) {}

  public async read(source: RandomAccessSource): Promise<Recording> {
    const boxes = await this.dependencies.boxScanner.scan(source);
    const trailer = await this.dependencies.trailerReader.read(source);
    const info = this.dependencies.infoRecordParser.parse(
      await this.readInfoRecord(source, trailer),
    );
    const calibration = this.dependencies.calibrationSelector.select(info.calibration);
    return new Recording({
      source,
      boxes,
      trailer,
      info,
      calibration,
      gyroParser: this.dependencies.gyroRecordParser,
      exposureParser: this.dependencies.exposureRecordParser,
    });
  }

  private async readInfoRecord(source: RandomAccessSource, trailer: Trailer): Promise<Uint8Array> {
    if (!trailer.has(RecordType.Info)) {
      throw new GyroViewError(
        'no-info-record',
        'the trailer has no info record; the file is not a camera recording',
      );
    }
    return trailer.readRecord(source, RecordType.Info);
  }
}
