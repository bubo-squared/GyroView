import type { RandomAccessSource } from './RandomAccessSource';
import type {
  EncodedVideoPacket,
  VideoDecoderConfiguration,
  VideoTrackDescription,
} from './VideoTrack';
import type { Seconds } from '../shared/units/time';

export interface AudioTrackDescription {
  readonly trackIndex: number;
  /**
   * WebCodecs codec string, for example `mp4a.40.2`; `unknown` when the container does not say.
   */
  readonly codec: string;
}

/**
 * One compressed audio sample as the container stores it. Every audio packet is a key packet.
 */
export interface EncodedAudioPacket {
  readonly timestamp: Seconds;
  readonly duration: Seconds;
  readonly data: Uint8Array;
}

export interface AudioDecoderConfiguration {
  readonly codec: string;
  readonly sampleRate: number;
  readonly channelCount: number;
  /**
   * Codec-specific bytes (the AudioSpecificConfig for AAC) when the container carries them.
   */
  readonly description: Uint8Array | undefined;
}

/**
 * Random access into one audio track's samples.
 */
export interface AudioTrackReader {
  readonly description: AudioTrackDescription;
  decoderConfiguration(): Promise<AudioDecoderConfiguration>;
  duration(): Promise<Seconds>;
  /**
   * Packets in decode order from the one playing at `time` (or the first one after it) to the
   * end of the track.
   */
  packetsFrom(time: Seconds): AsyncIterable<EncodedAudioPacket>;
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
   * Packets in decode order starting with `start`, until the track ends. `start` must be a
   * packet this reader handed out; anything else is an `invariant-violation`.
   */
  packetsFrom(start: EncodedVideoPacket): AsyncIterable<EncodedVideoPacket>;
  /**
   * Presentation timestamps of every sample, in frame order. Costly on long tracks; used only
   * when the frame timing has to come from the track itself.
   */
  sampleTimestamps(): Promise<readonly Seconds[]>;
  frameCount(): Promise<number>;
}

/**
 * One opened container file.
 */
export interface DemuxedInput {
  readonly name: string | undefined;
  readonly duration: Seconds;
  readonly videoTracks: readonly VideoTrackReader[];
  readonly audioTracks: readonly AudioTrackReader[];
  dispose(): void;
}

/**
 * Port: opens a container over a {@link RandomAccessSource}.
 */
export interface Demuxer {
  open(source: RandomAccessSource, name?: string): Promise<DemuxedInput>;
}
