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
