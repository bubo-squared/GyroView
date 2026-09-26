import { BoxType } from './boxConstants';
import type { ByteRange } from '../../../shared/binary/ByteRange';

export interface BoxDescriptor {
  readonly type: string;
  /**
   * The whole box, header included.
   */
  readonly range: ByteRange;
}

/**
 * How the trailer is attached: inside an `inst` box (newer firmware) or bare after the boxes,
 * where the scan stops.
 */
export type TrailerWrapper = 'inst-box' | 'bare';

export function trailerWrapperOf(boxes: readonly BoxDescriptor[]): TrailerWrapper {
  const isWrapped = boxes.some((box) => box.type === BoxType.Insta360Trailer);
  return isWrapped ? 'inst-box' : 'bare';
}
