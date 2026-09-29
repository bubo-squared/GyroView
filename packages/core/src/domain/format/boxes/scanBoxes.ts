import type { BoxDescriptor } from './BoxLayout';
import { BOX_HEADER_SIZE, LARGE_BOX_HEADER_SIZE } from './boxConstants';
import { boxHeaderOf } from './boxHeader';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { ByteRange } from '../../../shared/binary/ByteRange';
import { ByteReader } from '../../../shared/binary/ByteReader';

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
  const room = fileSize - offset;
  const headerLength = Math.min(LARGE_BOX_HEADER_SIZE, room);
  const header = new ByteReader(await source.read(ByteRange.of(offset, headerLength)));
  const box = boxHeaderOf(header, room);
  return box && { type: box.type, range: ByteRange.of(offset, box.size) };
}
