import type { RecordLocation } from './RecordLocation';
import {
  INDEX_SLOT_FORMAT_OFFSET,
  INDEX_SLOT_ID_OFFSET,
  INDEX_SLOT_OFFSET_OFFSET,
  INDEX_SLOT_SIZE,
  INDEX_SLOT_SIZE_OFFSET,
} from '../constants';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * Parses the index record (id 0) into record locations. Slot offsets are relative to the
 * trailer payload start, so the caller supplies that absolute position.
 */
export function parseRecordIndex(
  bytes: Uint8Array,
  payloadStart: number,
): readonly RecordLocation[] {
  if (bytes.byteLength % INDEX_SLOT_SIZE !== 0) {
    throw new GyroViewError(
      'invalid-trailer',
      `index size ${bytes.byteLength} is not a multiple of ${INDEX_SLOT_SIZE}`,
    );
  }
  const reader = new ByteReader(bytes);
  const records: RecordLocation[] = [];
  for (let slotOffset = 0; slotOffset < bytes.byteLength; slotOffset += INDEX_SLOT_SIZE) {
    const location = slotAt(reader, slotOffset, payloadStart);
    if (location) records.push(location);
  }
  return records;
}

function slotAt(
  reader: ByteReader,
  slotOffset: number,
  payloadStart: number,
): RecordLocation | undefined {
  const size = reader.uint32LeAt(slotOffset + INDEX_SLOT_SIZE_OFFSET);
  const isEmptySlot = size === 0;
  return isEmptySlot
    ? undefined
    : {
        id: reader.uint8At(slotOffset + INDEX_SLOT_ID_OFFSET),
        format: reader.uint8At(slotOffset + INDEX_SLOT_FORMAT_OFFSET),
        payload: ByteRange.of(
          payloadStart + reader.uint32LeAt(slotOffset + INDEX_SLOT_OFFSET_OFFSET),
          size,
        ),
      };
}
