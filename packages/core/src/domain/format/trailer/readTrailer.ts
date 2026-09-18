import { locateRecords } from './locateRecords';
import { RecordHeader } from './RecordHeader';
import { Trailer } from './Trailer';
import { TrailerFooter } from './TrailerFooter';
import type { TrailerLayout } from './TrailerLayout';
import { RECORD_HEADER_SIZE, TRAILER_FOOTER_SIZE } from '../constants';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

const TAIL_SIZE = RECORD_HEADER_SIZE + TRAILER_FOOTER_SIZE;

/**
 * Reads the trailer's table of contents with as few round trips as possible: one read for the
 * footer plus last header, then whatever locating the records needs. `fileSize` is passed in so
 * the caller can share one size lookup between several readers of the same source.
 */
export async function readTrailer(source: RandomAccessSource, fileSize: number): Promise<Trailer> {
  if (fileSize < TAIL_SIZE) {
    throw new GyroViewError(
      'invalid-trailer',
      `file of ${fileSize} bytes is too small to hold a trailer`,
    );
  }
  const layout = parseLayout(await source.read(ByteRange.lastOf(fileSize, TAIL_SIZE)), fileSize);
  return new Trailer(layout.footer, layout.payloadStart, await locateRecords(source, layout));
}

function parseLayout(tail: Uint8Array, fileSize: number): TrailerLayout {
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
