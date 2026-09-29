import {
  BOX_HEADER_SIZE,
  BOX_SIZE_IS_LARGE,
  BOX_SIZE_OFFSET,
  BOX_SIZE_TO_END_OF_FILE,
  BOX_TYPE_LENGTH,
  BOX_TYPE_OFFSET,
  LARGE_BOX_HEADER_SIZE,
  LARGE_SIZE_OFFSET,
  isPlausibleBoxType,
} from './boxConstants';
import type { ByteReader } from '../../../shared/binary/ByteReader';
import { hasErrorCode } from '../../../shared/errors/GyroViewError';

/**
 * What a box header says: the box's type, its whole size and how much of it the header takes.
 */
export interface BoxHeader {
  readonly type: string;
  readonly size: number;
  readonly headerSize: number;
}

/**
 * The header of the box whose first bytes `header` holds, in a space of `room` bytes from the
 * box's start (to the end of the file, or of the box around it), which a size of zero fills.
 * Undefined when those bytes form no box that fits there: the file's boxes have ended and a
 * bare trailer begins, or a box inside another is malformed.
 */
export function boxHeaderOf(header: ByteReader, room: number): BoxHeader | undefined {
  if (header.length < BOX_HEADER_SIZE) return undefined;
  const type = header.asciiAt(BOX_TYPE_OFFSET, BOX_TYPE_LENGTH);
  if (!isPlausibleBoxType(type)) return undefined;
  const extent = extentOf(header, room);
  const isWellFormed =
    extent !== undefined && extent.size >= extent.headerSize && extent.size <= room;
  return isWellFormed ? { type, ...extent } : undefined;
}

type BoxExtent = Omit<BoxHeader, 'type'>;

/**
 * Undefined when the header declares a large size that is not a safe integer: real boxes never
 * do, so those bytes are not a box.
 */
function extentOf(header: ByteReader, room: number): BoxExtent | undefined {
  const declared = header.uint32BeAt(BOX_SIZE_OFFSET);
  if (declared === BOX_SIZE_IS_LARGE && header.length >= LARGE_BOX_HEADER_SIZE) {
    return largeExtent(header);
  }
  const size = declared === BOX_SIZE_TO_END_OF_FILE ? room : declared;
  return { size, headerSize: BOX_HEADER_SIZE };
}

function largeExtent(header: ByteReader): BoxExtent | undefined {
  try {
    return { size: header.uint64BeAt(LARGE_SIZE_OFFSET), headerSize: LARGE_BOX_HEADER_SIZE };
  } catch (error) {
    if (hasErrorCode(error, 'binary-unsafe-integer')) return undefined;
    throw error;
  }
}
