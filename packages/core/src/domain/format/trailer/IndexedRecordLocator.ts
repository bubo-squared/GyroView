import { RecordIndex } from './RecordIndex';
import type { RecordLocation } from './RecordLocation';
import type { RecordLocator } from './RecordLocator';
import type { TrailerLayout } from './TrailerLayout';
import { RECORD_HEADER_SIZE, TRAILER_FOOTER_SIZE } from '../constants';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * Reads the index record that sits immediately before the footer and trusts its slots.
 */
export class IndexedRecordLocator implements RecordLocator {
  public async locate(
    source: RandomAccessSource,
    layout: TrailerLayout,
  ): Promise<readonly RecordLocation[]> {
    const indexEnd = layout.fileSize - TRAILER_FOOTER_SIZE - RECORD_HEADER_SIZE;
    const indexRange = ByteRange.of(
      indexEnd - layout.lastHeader.payloadSize,
      layout.lastHeader.payloadSize,
    );
    const records = RecordIndex.parse(await source.read(indexRange), layout.payloadStart).records;
    for (const record of records) this.ensureInsideTrailer(record, layout, indexRange);
    return records;
  }

  private ensureInsideTrailer(
    record: RecordLocation,
    layout: TrailerLayout,
    indexRange: ByteRange,
  ): void {
    if (record.payload.offset < layout.payloadStart || record.payload.end > indexRange.offset) {
      throw new GyroViewError(
        'invalid-trailer',
        `record ${record.id} at ${record.payload.offset}+${record.payload.length} lies outside the trailer`,
      );
    }
  }
}
