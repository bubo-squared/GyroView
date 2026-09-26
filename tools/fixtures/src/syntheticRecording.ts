import { RecordType } from '@gyroview/core';
import { InfoRecordFormat, TrailerFixtureBuilder } from '@gyroview/core/testing';

/**
 * The trailer records a synthetic recording carries, cut from a real X5 file.
 */
export interface TrailerRecords {
  readonly info: Uint8Array;
  readonly gyro: Uint8Array;
  readonly exposure: Uint8Array;
}

/**
 * Records sit at aligned offsets like the camera's (1 MiB there); 4 KiB keeps the fixture small.
 */
const RECORD_ALIGNMENT = 4096;

/**
 * A playable MP4 followed by an `inst`-wrapped indexed X5 trailer: what the player sees when it
 * opens a real recording, at a size that can live in the repository.
 */
export function assembleSyntheticRecording(media: Uint8Array, records: TrailerRecords): Uint8Array {
  return new TrailerFixtureBuilder()
    .withPrefix(media)
    .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: records.info })
    .addRecord({ id: RecordType.Gyro, payload: records.gyro })
    .addRecord({ id: RecordType.Exposure, payload: records.exposure })
    .buildIndexed({ alignment: RECORD_ALIGNMENT, wrapInInstBox: true }).bytes;
}
