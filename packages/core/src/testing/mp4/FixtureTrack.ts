/**
 * One sample of a synthetic track.
 */
export interface FixtureSample {
  readonly bytes: Uint8Array;
  /**
   * Decode duration, in the track's timescale.
   */
  readonly duration: number;
  readonly isSync: boolean;
  /**
   * Presentation time less decode time, in the track's timescale; zero when absent.
   */
  readonly compositionOffset?: number;
}

/**
 * A segment of an edit list: `mediaTime` -1 shows nothing for `segmentDuration`.
 */
export interface FixtureEdit {
  /**
   * In the movie timescale.
   */
  readonly segmentDuration: number;
  /**
   * In the track's timescale.
   */
  readonly mediaTime: number;
}

/**
 * A synthetic track: its samples, how they are described and how they sit in the file. The
 * variants the cameras' files differ in are chosen here, never inferred.
 */
export interface FixtureTrack {
  readonly trackId: number;
  /**
   * The handler type: `vide`, `soun`, or another that the player ignores.
   */
  readonly handler: string;
  /**
   * The whole sample entry box, from `videoSampleEntry` or `audioSampleEntry`.
   */
  readonly sampleEntry: Uint8Array;
  readonly timescale: number;
  readonly samples: readonly FixtureSample[];
  /**
   * How many samples each chunk holds, chunk after chunk; the last count holds for the rest.
   * One per chunk when absent, as in the cameras' files.
   */
  readonly chunkSizes?: readonly number[];
  /**
   * `unlisted` writes no sync sample table: every sample is one.
   */
  readonly syncSamples?: 'listed' | 'unlisted';
  /**
   * The composition offset table's version; none is written when absent.
   */
  readonly compositionOffsets?: 'version-0' | 'version-1';
  readonly edits?: readonly FixtureEdit[];
}
