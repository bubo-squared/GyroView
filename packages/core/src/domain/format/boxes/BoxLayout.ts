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

export function findBox(layout: BoxLayout, type: string): BoxDescriptor | undefined {
  return layout.boxes.find((box) => box.type === type);
}

export function trailerWrapperOf(layout: BoxLayout): TrailerWrapper {
  return findBox(layout, BoxType.Insta360Trailer) ? 'inst-box' : 'bare';
}
