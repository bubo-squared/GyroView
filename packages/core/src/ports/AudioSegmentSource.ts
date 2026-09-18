import type { Seconds } from '../shared/units/time';

/**
 * Port: a recording's audio track re-packaged as fragmented MP4 for a platform media pipeline
 * (Media Source Extensions), so that an audio element can be the master clock. Produced on the
 * demuxing side, consumed on the clock side.
 */
export interface AudioSegmentSource {
  /**
   * Container type with the codecs parameter, as `MediaSource.isTypeSupported` expects it.
   */
  readonly mimeType: string;
  readonly duration: Seconds;
  /**
   * Byte-stream pieces in order: the initialization segment, then media segments from the one
   * holding `from` to the end of the track. Consumers pull; ending the iteration early stops the
   * re-packaging.
   */
  segmentsFrom(from: Seconds): AsyncIterable<Uint8Array<ArrayBuffer>>;
}
