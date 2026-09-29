import type { AudioSegmentSource } from './AudioSegmentSource';
import type { AudioSampleSource } from './AudioSampleSource';
import type { AudioDecoderConfiguration } from './AudioTrack';

/**
 * Port: re-packages an audio track's samples, unchanged, for a platform media pipeline (Media
 * Source Extensions), so that an audio element can be the clock the picture follows.
 */
export interface AudioPackager {
  /**
   * Throws `codec-unsupported` for a codec it cannot re-package.
   */
  segmentsOf(
    samples: AudioSampleSource,
    configuration: AudioDecoderConfiguration,
  ): AudioSegmentSource;
}
