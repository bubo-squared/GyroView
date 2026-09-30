import type { Seconds } from '../shared/units/time';

/**
 * What the codec reader tells the domain about one video track. Enough to decide the lens layout
 * without knowing the container library.
 */
export interface VideoTrackDescription {
  readonly trackIndex: number;
  readonly codedWidth: number;
  readonly codedHeight: number;
  /**
   * WebCodecs codec string, for example `hvc1.1.6.L153.B0` or `avc1.640033`.
   */
  readonly codec: string;
}

/**
 * One compressed video sample as the container stores it. Timestamps are track time in seconds;
 * `data` holds length-prefixed NAL units when `configuration.description` is present.
 */
export interface EncodedVideoPacket {
  readonly timestamp: Seconds;
  readonly duration: Seconds;
  readonly isKeyFrame: boolean;
  readonly data: Uint8Array;
}

/**
 * When a key frame shows and for how long: what the sample table tells without reading the
 * frame itself.
 */
export interface KeyframeTime {
  readonly timestamp: Seconds;
  readonly duration: Seconds;
}

/**
 * Codec parameters a decoder needs, expressed without platform types so the core stays free of
 * DOM declarations.
 */
export interface VideoDecoderConfiguration {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly description: Uint8Array | undefined;
  readonly isFullRange: boolean | undefined;
}
