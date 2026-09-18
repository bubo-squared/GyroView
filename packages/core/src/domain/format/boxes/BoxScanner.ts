import type { BoxDescriptor, BoxLayout } from './BoxLayout';
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

/**
 * Walks the top-level boxes of a file with one small read per box. Stops at the first bytes that
 * do not form a box header and reports them as trailing bytes.
 */
export class BoxScanner {
  public async scan(source: RandomAccessSource): Promise<BoxLayout> {
    const fileSize = await source.size();
    const boxes: BoxDescriptor[] = [];
    let offset = 0;
    while (offset + BOX_HEADER_SIZE <= fileSize) {
      const box = await this.readBoxAt(source, offset, fileSize);
      if (!box) break;
      boxes.push(box);
      offset = box.range.end;
    }
    const trailingBytes = offset < fileSize ? ByteRange.of(offset, fileSize - offset) : undefined;
    return { boxes, trailingBytes };
  }

  private async readBoxAt(
    source: RandomAccessSource,
    offset: number,
    fileSize: number,
  ): Promise<BoxDescriptor | undefined> {
    const headerLength = Math.min(LARGE_BOX_HEADER_SIZE, fileSize - offset);
    const header = new ByteReader(await source.read(ByteRange.of(offset, headerLength)));
    const type = header.asciiAt(BOX_TYPE_OFFSET, BOX_TYPE_LENGTH);
    if (!isPlausibleBoxType(type)) return undefined;
    const { size, headerSize } = this.resolveSize(header, offset, fileSize);
    const isWellFormed = size >= headerSize && offset + size <= fileSize;
    return isWellFormed ? { type, range: ByteRange.of(offset, size), headerSize } : undefined;
  }

  private resolveSize(
    header: ByteReader,
    offset: number,
    fileSize: number,
  ): { size: number; headerSize: number } {
    const declared = header.uint32BeAt(BOX_SIZE_OFFSET);
    if (declared === BOX_SIZE_IS_LARGE && header.length >= LARGE_BOX_HEADER_SIZE) {
      return { size: header.uint64BeAt(LARGE_SIZE_OFFSET), headerSize: LARGE_BOX_HEADER_SIZE };
    }
    const size = declared === BOX_SIZE_TO_END_OF_FILE ? fileSize - offset : declared;
    return { size, headerSize: BOX_HEADER_SIZE };
  }
}
