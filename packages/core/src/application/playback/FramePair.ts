import type { DecodedFrame } from '../../ports/VideoDecoderPort';
import type { Seconds } from '../../shared/units/time';

/**
 * The decoded pictures of every lens for one instant, in lens order.
 */
export interface FramePair<Handle = unknown> {
  readonly timestamp: Seconds;
  readonly frames: readonly DecodedFrame<Handle>[];
}

export function closeFramePair(pair: FramePair): void {
  for (const frame of pair.frames) frame.close();
}
