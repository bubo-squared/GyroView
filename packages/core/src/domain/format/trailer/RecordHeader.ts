import {
  RECORD_HEADER_FORMAT_OFFSET,
  RECORD_HEADER_ID_OFFSET,
  RECORD_HEADER_SIZE,
  RECORD_HEADER_SIZE_OFFSET,
} from '../constants';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * The 6-byte header that follows each record payload.
 */
export class RecordHeader {
  private constructor(
    public readonly format: number,
    public readonly id: number,
    public readonly payloadSize: number,
  ) {}

  public static parse(bytes: Uint8Array): RecordHeader {
    if (bytes.byteLength !== RECORD_HEADER_SIZE) {
      throw new GyroViewError(
        'invalid-trailer',
        `record header must be ${RECORD_HEADER_SIZE} bytes, got ${bytes.byteLength}`,
      );
    }
    const reader = new ByteReader(bytes);
    return new RecordHeader(
      reader.uint8At(RECORD_HEADER_FORMAT_OFFSET),
      reader.uint8At(RECORD_HEADER_ID_OFFSET),
      reader.uint32LeAt(RECORD_HEADER_SIZE_OFFSET),
    );
  }
}
