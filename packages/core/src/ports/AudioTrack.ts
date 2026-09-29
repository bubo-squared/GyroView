import type { Seconds } from '../shared/units/time';

/**
 * One compressed audio sample as the container stores it, at track time in seconds.
 */
export interface EncodedAudioSample {
  readonly timestamp: Seconds;
  readonly duration: Seconds;
  readonly data: Uint8Array;
}

/**
 * Codec parameters an audio decoder, or a muxer re-packaging the samples, needs; without
 * platform types, so the core stays free of DOM declarations.
 */
export interface AudioDecoderConfiguration {
  /**
   * WebCodecs codec string, for example `mp4a.40.2` for AAC-LC.
   */
  readonly codec: string;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  /**
   * The codec's own configuration (AAC's AudioSpecificConfig), when it has one.
   */
  readonly description: Uint8Array | undefined;
}
