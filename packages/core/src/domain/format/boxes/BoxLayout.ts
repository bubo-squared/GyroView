import { BoxType } from './boxConstants';
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

/**
 * How the trailer is attached: inside an `inst` box (newer firmware) or bare after the boxes.
 */
export type TrailerWrapper = 'inst-box' | 'bare';

export function trailerWrapperOf(layout: BoxLayout): TrailerWrapper {
  const isWrapped = layout.boxes.some((box) => box.type === BoxType.Insta360Trailer);
  return isWrapped ? 'inst-box' : 'bare';
}
