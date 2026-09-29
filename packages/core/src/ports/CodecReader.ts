import type { AudioDecoderConfiguration } from './AudioTrack';
import type { VideoDecoderConfiguration, VideoTrackDescription } from './VideoTrack';

/**
 * A video track's codec, for the track of the sample table with the same id.
 */
export interface VideoTrackCodec {
  readonly trackId: number;
  readonly description: VideoTrackDescription;
  readonly configuration: VideoDecoderConfiguration;
}

/**
 * An audio track's codec, for the track of the sample table with the same id.
 */
export interface AudioTrackCodec {
  readonly trackId: number;
  readonly configuration: AudioDecoderConfiguration;
}

/**
 * The codecs of a file's tracks of picture and sound; video tracks in the order the file lists
 * them, their `trackIndex` counting them.
 */
export interface ContainerCodecs {
  readonly video: readonly VideoTrackCodec[];
  readonly audio: readonly AudioTrackCodec[];
}

/**
 * Port: tells the decoder configuration of each track of a file from its file type and movie
 * boxes, held in memory; it reads no sample. Rejects with `unsupported-container` for bytes that
 * are no movie, and with `codec-unsupported` for a video track it cannot configure.
 */
export interface CodecReader {
  read(movieBytes: Uint8Array): Promise<ContainerCodecs>;
}
