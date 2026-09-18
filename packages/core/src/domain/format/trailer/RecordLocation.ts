import type { ByteRange } from '../../../shared/binary/ByteRange';

/**
 * Where one trailer record's payload lives in the file, and how it is encoded.
 */
export interface RecordLocation {
  readonly id: number;
  readonly format: number;
  readonly payload: ByteRange;
}
