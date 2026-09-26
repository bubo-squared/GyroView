import type { AudioSegmentSource } from './AudioSegmentSource';
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
 * One audio track of an opened container. The core never reads audio samples: the track goes,
 * re-packaged, to the platform's media pipeline, which plays it as the master clock.
 */
export interface AudioTrackReader {
  readonly description: AudioTrackDescription;
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
