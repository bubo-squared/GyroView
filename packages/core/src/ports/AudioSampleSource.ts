import type { EncodedAudioSample } from './AudioTrack';
import type { Seconds } from '../shared/units/time';

/**
 * Port: one audio track's samples, as a media pipeline takes them to re-package or decode.
 */
export interface AudioSampleSource {
  /**
   * When the track's last sample stops playing.
   */
  readonly duration: Seconds;
  /**
   * Samples in decode order from the one playing at `time` (the first, for a time before it)
   * until the track ends. Returning the iteration lets go of what it reads at once, even while a
   * sample is awaited, which then comes as the end.
   */
  samplesFrom(time: Seconds): AsyncIterable<EncodedAudioSample>;
}
