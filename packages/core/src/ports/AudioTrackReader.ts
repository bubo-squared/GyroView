import type { AudioSegmentSource } from './AudioSegmentSource';

/**
 * Port: one audio track of a recording. The core never reads audio samples for itself: the
 * track goes, re-packaged, to the platform's media pipeline, which plays it as the master clock.
 */
export interface AudioTrackReader {
  /**
   * The track as fragmented MP4; rejects with `codec-unsupported` when it cannot be re-packaged.
   */
  openSegments(): Promise<AudioSegmentSource>;
}
