import { RecordHeader } from './RecordHeader';
import type { RecordLocation } from './RecordLocation';
import type { RecordLocator } from './RecordLocator';
import type { TrailerLayout } from './TrailerLayout';
import { RECORD_HEADER_SIZE, TRAILER_FOOTER_SIZE } from '../constants';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * Walks record headers backwards from the footer until the trailer payload start is reached.
 * Works only when records are contiguous (no padding), which is the pre-index layout.
 */
export class BackwardWalkRecordLocator implements RecordLocator {
  public async locate(
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
      this.ensureNotBeforePayloadStart(payloadOffset, header, layout);
      records.push({
        id: header.id,
        format: header.format,
        payload: ByteRange.of(payloadOffset, header.payloadSize),
      });
      recordEnd = payloadOffset;
    }
    return records.toReversed();
  }

  private ensureNotBeforePayloadStart(
    payloadOffset: number,
    header: RecordHeader,
    layout: TrailerLayout,
  ): void {
    if (payloadOffset < layout.payloadStart) {
      throw new GyroViewError(
        'invalid-trailer',
        `record ${header.id} (${header.payloadSize} bytes) runs past the trailer start; records are not contiguous`,
      );
    }
  }
}
