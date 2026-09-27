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
  const indexOffset = indexEnd - layout.lastHeader.payloadSize;
  // Checked before reading: a damaged size would otherwise read gigabytes into memory.
  ensureNotBeforePayloadStart(indexOffset, layout.lastHeader, layout.payloadStart);
  const indexRange = ByteRange.of(indexOffset, layout.lastHeader.payloadSize);
  const records = parseRecordIndex(await source.read(indexRange), layout.payloadStart);
  for (const record of records) ensureBeforeIndex(record, indexRange.offset);
  return records;
}

/**
 * The index counts every offset from the payload start, so only a record's end can stray: past
 * the index, into the footer or beyond the file.
 */
function ensureBeforeIndex(record: RecordLocation, indexStart: number): void {
  if (record.payload.end > indexStart) {
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
  const chunks = new BackwardChunks(source, layout.payloadStart);
  let recordEnd = layout.fileSize - TRAILER_FOOTER_SIZE;
  while (recordEnd > layout.payloadStart) {
    const header = RecordHeader.parse(await chunks.bytesEndingAt(recordEnd, RECORD_HEADER_SIZE));
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

/**
 * How much of the trailer one read of the backward walk takes: the headers of the small records
 * near the footer share one, and only a large payload (the gyro record) sends the walk past it.
 */
const WALK_CHUNK_SIZE = 65_536;

/**
 * Reads the trailer backwards a chunk at a time, so walking a bare trailer costs a round trip
 * per chunk rather than per record, each read being an HTTP request.
 */
class BackwardChunks {
  private chunkStart = 0;
  private chunk: Uint8Array = new Uint8Array();

  public constructor(
    private readonly source: RandomAccessSource,
    private readonly trailerStart: number,
  ) {}

  public async bytesEndingAt(end: number, length: number): Promise<Uint8Array> {
    const start = end - length;
    if (start < this.trailerStart) {
      throw new GyroViewError(
        'invalid-trailer',
        `a record header at ${start} lies before the trailer`,
      );
    }
    const isInChunk = start >= this.chunkStart && end <= this.chunkStart + this.chunk.byteLength;
    if (!isInChunk) await this.readChunkEndingAt(end);
    return this.chunk.subarray(start - this.chunkStart, end - this.chunkStart);
  }

  private async readChunkEndingAt(end: number): Promise<void> {
    this.chunkStart = Math.max(this.trailerStart, end - WALK_CHUNK_SIZE);
    this.chunk = await this.source.read(ByteRange.of(this.chunkStart, end - this.chunkStart));
  }
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
