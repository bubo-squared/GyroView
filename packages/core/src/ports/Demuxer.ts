import type { RandomAccessSource } from './RandomAccessSource';
import type { VideoTrackDescription } from '../domain/format/layout/VideoTrackDescription';
import type { Seconds } from '../shared/units/time';

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
 * Codec parameters a decoder needs, expressed without WebCodecs types so the core stays free of
 * DOM declarations. The WebCodecs adapter maps this onto `VideoDecoderConfig`.
 */
export interface VideoDecoderConfiguration {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly description: Uint8Array | undefined;
  readonly isFullRange: boolean | undefined;
}

export interface AudioTrackDescription {
  readonly trackIndex: number;
  readonly codec: string;
  readonly sampleRate: number;
  readonly channelCount: number;
}

/**
 * Random access into one video track's samples.
 */
export interface VideoTrackReader {
  readonly description: VideoTrackDescription;
  decoderConfiguration(): Promise<VideoDecoderConfiguration>;
  /**
   * The last key packet at or before `time`, or undefined before the first one.
   */
  keyPacketAt(time: Seconds): Promise<EncodedVideoPacket | undefined>;
  /**
   * Packets in decode order starting with `start`, until the track ends.
   */
  packetsFrom(start: EncodedVideoPacket): AsyncIterable<EncodedVideoPacket>;
  /**
   * Presentation timestamps of every sample, in frame order. Costly on long tracks; used only
   * when the frame timing has to come from the track itself.
   */
  sampleTimestamps(): Promise<readonly number[]>;
  frameCount(): Promise<number>;
}

/**
 * One opened container file.
 */
export interface DemuxedInput {
  readonly name: string | undefined;
  readonly duration: Seconds;
  readonly videoTracks: readonly VideoTrackReader[];
  readonly audioTracks: readonly AudioTrackDescription[];
  dispose(): void;
}

/**
 * Port: opens a container over a {@link RandomAccessSource}. Implemented by the mediabunny adapter.
 */
export interface Demuxer {
  open(source: RandomAccessSource, name?: string): Promise<DemuxedInput>;
}
