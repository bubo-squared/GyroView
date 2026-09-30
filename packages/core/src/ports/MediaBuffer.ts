import type { Seconds } from '../shared/units/time';

/**
 * Port: what of the recording lies downloaded ahead of the playhead, so that playback that
 * starved of it plays again only once there is enough to go on with (ADR 0011).
 */
export interface MediaBuffer {
  /**
   * Whether playback standing at `time` has enough downloaded ahead to play again.
   */
  isReadyToResumeAt(time: Seconds): boolean;
  /**
   * Tells `listener` whenever more has come, until the function it returns is called.
   */
  onProgress(listener: () => void): () => void;
}
