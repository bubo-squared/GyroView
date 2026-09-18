import type { ByteRange } from '../../../shared/binary/ByteRange';

export interface BoxDescriptor {
  readonly type: string;
  /**
   * The whole box, header included.
   */
  readonly range: ByteRange;
  readonly headerSize: number;
}

/**
 * What a top-level scan of an MP4-like file found.
 */
export interface BoxLayout {
  readonly boxes: readonly BoxDescriptor[];
  /**
   * Bytes after the last well-formed box, if any: a bare Insta360 trailer lives here.
   */
  readonly trailingBytes: ByteRange | undefined;
}

export function findBox(layout: BoxLayout, type: string): BoxDescriptor | undefined {
  return layout.boxes.find((box) => box.type === type);
}
