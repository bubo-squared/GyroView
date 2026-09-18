import { BackwardWalkRecordLocator } from './BackwardWalkRecordLocator';
import { IndexedRecordLocator } from './IndexedRecordLocator';
import { RecordHeader } from './RecordHeader';
import type { RecordLocator } from './RecordLocator';
import { Trailer } from './Trailer';
import { TrailerFooter } from './TrailerFooter';
import type { TrailerLayout } from './TrailerLayout';
import { RECORD_HEADER_SIZE, RecordType, TRAILER_FOOTER_SIZE } from '../constants';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

const TAIL_SIZE = RECORD_HEADER_SIZE + TRAILER_FOOTER_SIZE;

/**
 * Reads the trailer's table of contents with as few round trips as possible: one read for the
 * footer plus last header, then whatever the chosen {@link RecordLocator} needs.
 */
export class TrailerReader {
  public async read(source: RandomAccessSource): Promise<Trailer> {
    const fileSize = await source.size();
    if (fileSize < TAIL_SIZE) {
      throw new GyroViewError(
        'invalid-trailer',
        `file of ${fileSize} bytes is too small to hold a trailer`,
      );
    }
    const layout = this.parseLayout(
      await source.read(ByteRange.lastOf(fileSize, TAIL_SIZE)),
      fileSize,
    );
    const records = await this.chooseLocator(layout).locate(source, layout);
    return new Trailer(layout.footer, layout.payloadStart, records);
  }

  private parseLayout(tail: Uint8Array, fileSize: number): TrailerLayout {
    const reader = new ByteReader(tail);
    const footer = TrailerFooter.parse(reader.bytesAt(RECORD_HEADER_SIZE, TRAILER_FOOTER_SIZE));
    if (footer.trailerSize > fileSize) {
      throw new GyroViewError(
        'invalid-trailer',
        `trailer size ${footer.trailerSize} exceeds file size ${fileSize}`,
      );
    }
    return {
      fileSize,
      payloadStart: fileSize - footer.trailerSize,
      footer,
      lastHeader: RecordHeader.parse(reader.bytesAt(0, RECORD_HEADER_SIZE)),
    };
  }

  private chooseLocator(layout: TrailerLayout): RecordLocator {
    return layout.lastHeader.id === RecordType.Index
      ? new IndexedRecordLocator()
      : new BackwardWalkRecordLocator();
  }
}
