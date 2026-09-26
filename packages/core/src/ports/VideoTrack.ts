import type { Seconds } from '../shared/units/time';

/**
 * What the demuxer tells the domain about one video track. Enough to decide the lens layout
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
 * One opened file and the video tracks found in it.
 */
export interface InputDescription {
  /**
   * File name or URL path, used only as a hint (`_00_` / `_10_`) and for messages.
   */
  readonly name: string | undefined;
  readonly videoTracks: readonly VideoTrackDescription[];
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
