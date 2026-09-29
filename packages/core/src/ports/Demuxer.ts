import type { AudioSegmentSource } from './AudioSegmentSource';
import type { RandomAccessSource } from './RandomAccessSource';
import type {
  EncodedVideoPacket,
  KeyframeTime,
  VideoDecoderConfiguration,
  VideoTrackDescription,
} from './VideoTrack';
import type { Seconds } from '../shared/units/time';

/**
 * One audio track of an opened container. The core never reads audio samples: the track goes,
 * re-packaged, to the platform's media pipeline, which plays it as the master clock.
 */
export interface AudioTrackReader {
  /**
   * The track as fragmented MP4; rejects with `codec-unsupported` when it cannot be re-packaged.
   */
  openSegments(): Promise<AudioSegmentSource>;
}

/**
 * Random access into one video track's samples.
 */
export interface VideoTrackReader {
  readonly description: VideoTrackDescription;
  decoderConfiguration(): Promise<VideoDecoderConfiguration>;
  /**
   * When the last key frame at or before `time` shows, or undefined before the first one.
   */
  keyframeAt(time: Seconds): Promise<KeyframeTime | undefined>;
  /**
   * When the track's first key frame shows; undefined for a track without one.
   */
  firstKeyframe(): Promise<KeyframeTime | undefined>;
  /**
   * The last key packet at or before `time`, or undefined before the first one.
   */
  keyPacketAt(time: Seconds): Promise<EncodedVideoPacket | undefined>;
  /**
   * The track's first key packet, where decoding starts for a time before any key packet, as on
   * a track whose timestamps do not start at zero. Undefined for a track without one.
   */
  firstKeyPacket(): Promise<EncodedVideoPacket | undefined>;
  /**
   * Packets in decode order from the key frame at or before `time` (the first key frame, for a
   * time before it) until the track ends; a track without a key frame fails its first packet
   * with `no-key-frame`. Returning the iterator lets go of what it reads at once, even while a
   * packet is awaited, which then comes as the end.
   */
  packetsFrom(time: Seconds): AsyncIterable<EncodedVideoPacket>;
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
