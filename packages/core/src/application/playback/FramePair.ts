import type { DecodedFrame } from '../../ports/VideoDecoderPort';
import type { Seconds } from '../../shared/units/time';

/**
 * The decoded pictures of every frame source for one instant, in frame source order (for a packed
 * layout, one picture holds both lenses).
 */
export interface FramePair<Handle = unknown> {
  readonly timestamp: Seconds;
  readonly frames: readonly DecodedFrame<Handle>[];
}

export function closeFramePair(pair: FramePair): void {
  for (const frame of pair.frames) frame.close();
}
