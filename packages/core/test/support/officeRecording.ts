import { readRecording } from '../../src/application/recording/readRecording';
import type { Recording } from '../../src/application/recording/Recording';
import { RecordType } from '../../src/domain/format/constants';
import { InMemoryRandomAccessSource } from '../../src/testing/InMemoryRandomAccessSource';
import { TrailerFixtureBuilder } from '../../src/testing/TrailerFixtureBuilder';
import { loadFixture } from './fixtures';
import { minimalMp4Prefix } from './mp4Prefix';

const PROTOBUF = 1;

export interface OfficeRecordingParts {
  /**
   * An info record in place of the office one.
   */
  readonly info?: Uint8Array;
  readonly hasExposure?: boolean;
}

/**
 * A recording built from the office X5 fixture slices: its info record, the first 2000 gyro
 * samples and the first 16 exposure entries, behind a minimal MP4.
 */
export function officeRecording(parts: OfficeRecordingParts = {}): Promise<Recording> {
  const builder = new TrailerFixtureBuilder()
    .withPrefix(minimalMp4Prefix())
    .addRecord({
      id: RecordType.Info,
      format: PROTOBUF,
      payload: parts.info ?? loadFixture('x5/office/record-01-info.bin'),
    })
    .addRecord({
      id: RecordType.Gyro,
      payload: loadFixture('x5/office/record-03-gyro-first2000.bin'),
    });
  if (parts.hasExposure ?? true) {
    builder.addRecord({
      id: RecordType.Exposure,
      payload: loadFixture('x5/office/record-04-exposure-first16.bin'),
    });
  }
  return readRecording(new InMemoryRandomAccessSource(builder.buildContiguous().bytes));
}
