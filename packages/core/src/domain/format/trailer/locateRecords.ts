import { RecordHeader } from './RecordHeader';
import { parseRecordIndex } from './parseRecordIndex';
import type { RecordLocation } from './RecordLocation';
import type { TrailerLayout } from './TrailerLayout';
import { RECORD_HEADER_SIZE, RecordType, TRAILER_FOOTER_SIZE } from '../constants';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * Finds every record payload. Newer firmware writes an index record before the footer and pads
 * records to aligned offsets; older firmware writes records back to back, which can only be
 * walked backwards from the footer. The header before the footer tells which case applies.
 */
export function locateRecords(
  source: RandomAccessSource,
  layout: TrailerLayout,
): Promise<readonly RecordLocation[]> {
  return layout.lastHeader.id === RecordType.Index
    ? locateThroughIndex(source, layout)
    : locateByWalkingBackwards(source, layout);
}

async function locateThroughIndex(
  source: RandomAccessSource,
  layout: TrailerLayout,
): Promise<readonly RecordLocation[]> {
  const indexEnd = layout.fileSize - TRAILER_FOOTER_SIZE - RECORD_HEADER_SIZE;
  const indexRange = ByteRange.of(
    indexEnd - layout.lastHeader.payloadSize,
    layout.lastHeader.payloadSize,
  );
  const records = parseRecordIndex(await source.read(indexRange), layout.payloadStart);
  for (const record of records) ensureInsideTrailer(record, layout.payloadStart, indexRange.offset);
  return records;
}

function ensureInsideTrailer(
  record: RecordLocation,
  payloadStart: number,
  indexStart: number,
): void {
  if (record.payload.offset < payloadStart || record.payload.end > indexStart) {
    throw new GyroViewError(
      'invalid-trailer',
      `record ${record.id} at ${record.payload.offset}+${record.payload.length} lies outside the trailer`,
    );
  }
}

async function locateByWalkingBackwards(
  source: RandomAccessSource,
  layout: TrailerLayout,
): Promise<readonly RecordLocation[]> {
  const records: RecordLocation[] = [];
  let recordEnd = layout.fileSize - TRAILER_FOOTER_SIZE;
  while (recordEnd > layout.payloadStart) {
    const header = RecordHeader.parse(
      await source.read(ByteRange.of(recordEnd - RECORD_HEADER_SIZE, RECORD_HEADER_SIZE)),
    );
    const payloadOffset = recordEnd - RECORD_HEADER_SIZE - header.payloadSize;
    ensureNotBeforePayloadStart(payloadOffset, header, layout.payloadStart);
    records.push({
      id: header.id,
      format: header.format,
      payload: ByteRange.of(payloadOffset, header.payloadSize),
    });
    recordEnd = payloadOffset;
  }
  return records.toReversed();
}

function ensureNotBeforePayloadStart(
  payloadOffset: number,
  header: RecordHeader,
  payloadStart: number,
): void {
  if (payloadOffset < payloadStart) {
    throw new GyroViewError(
      'invalid-trailer',
      `record ${header.id} (${header.payloadSize} bytes) runs past the trailer start; records are not contiguous`,
    );
  }
}
