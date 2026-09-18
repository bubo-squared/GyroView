import { ExposureRecord } from './ExposureRecord';
import {
  EXPOSURE_DURATION_OFFSET,
  EXPOSURE_ENTRY_SIZE,
  EXPOSURE_TIMESTAMP_OFFSET,
} from './exposureLayout';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

export class ExposureRecordParser {
  public parse(payload: Uint8Array): ExposureRecord {
    if (payload.byteLength % EXPOSURE_ENTRY_SIZE !== 0) {
      throw new GyroViewError(
        'invalid-exposure-record',
        `exposure record of ${payload.byteLength} bytes is not a whole number of ${EXPOSURE_ENTRY_SIZE}-byte entries`,
      );
    }
    const count = payload.byteLength / EXPOSURE_ENTRY_SIZE;
    const reader = new ByteReader(payload);
    const timestamps = new Float64Array(count);
    const exposures = new Float64Array(count);
    for (let index = 0; index < count; index += 1) {
      const offset = index * EXPOSURE_ENTRY_SIZE;
      timestamps[index] = reader.uint64LeAt(offset + EXPOSURE_TIMESTAMP_OFFSET);
      exposures[index] = reader.float64LeAt(offset + EXPOSURE_DURATION_OFFSET);
    }
    return new ExposureRecord(timestamps, exposures);
  }
}
