import type {
  EncodedVideoPacket,
  KeyframeTime,
  VideoDecoderConfiguration,
  VideoTrackDescription,
} from './VideoTrack';
import type { Seconds } from '../shared/units/time';

/**
 * Port: random access into one video track's samples.
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
