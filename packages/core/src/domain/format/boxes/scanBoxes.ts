import type { BoxDescriptor } from './BoxLayout';
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
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * Walks the top-level boxes of a file with one small read per box, and stops at the first bytes
 * that do not form a box header, where a bare trailer begins. `fileSize` is passed in so the
 * caller can share one size lookup between several readers of the same source.
 */
export async function scanBoxes(
  source: RandomAccessSource,
  fileSize: number,
): Promise<readonly BoxDescriptor[]> {
  const boxes: BoxDescriptor[] = [];
  let offset = 0;
  while (offset + BOX_HEADER_SIZE <= fileSize) {
    const box = await readBoxAt(source, offset, fileSize);
    if (!box) break;
    boxes.push(box);
    offset = box.range.end;
  }
  return boxes;
}

async function readBoxAt(
  source: RandomAccessSource,
  offset: number,
  fileSize: number,
): Promise<BoxDescriptor | undefined> {
  const headerLength = Math.min(LARGE_BOX_HEADER_SIZE, fileSize - offset);
  const header = new ByteReader(await source.read(ByteRange.of(offset, headerLength)));
  const type = header.asciiAt(BOX_TYPE_OFFSET, BOX_TYPE_LENGTH);
  if (!isPlausibleBoxType(type)) return undefined;
  const resolved = resolveSize(header, offset, fileSize);
  if (!resolved) return undefined;
  const { size, headerSize } = resolved;
  const isWellFormed = size >= headerSize && offset + size <= fileSize;
  return isWellFormed ? { type, range: ByteRange.of(offset, size) } : undefined;
}

interface ResolvedSize {
  readonly size: number;
  readonly headerSize: number;
}

/**
 * Undefined when the header declares a large size that is not a safe integer: real boxes never
 * do, so those bytes are trailer data, not a box.
 */
function resolveSize(
  header: ByteReader,
  offset: number,
  fileSize: number,
): ResolvedSize | undefined {
  const declared = header.uint32BeAt(BOX_SIZE_OFFSET);
  if (declared === BOX_SIZE_IS_LARGE && header.length >= LARGE_BOX_HEADER_SIZE) {
    return largeSize(header);
  }
  const size = declared === BOX_SIZE_TO_END_OF_FILE ? fileSize - offset : declared;
  return { size, headerSize: BOX_HEADER_SIZE };
}

function largeSize(header: ByteReader): ResolvedSize | undefined {
  try {
    return { size: header.uint64BeAt(LARGE_SIZE_OFFSET), headerSize: LARGE_BOX_HEADER_SIZE };
  } catch (error) {
    if (error instanceof GyroViewError && error.code === 'binary-unsafe-integer') return undefined;
    throw error;
  }
}
