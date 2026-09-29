import type { TrackSampleTable } from './TrackSampleTable';
import { seconds, type Seconds } from '../../shared/units/time';

/**
 * Every sample of one file, track by track, as its movie box describes them: the player's own
 * reading of the container, from which it downloads and decodes.
 */
export class SampleTable {
  public constructor(public readonly tracks: readonly TrackSampleTable[]) {}

  public get videoTracks(): readonly TrackSampleTable[] {
    return this.tracks.filter((track) => track.kind === 'video');
  }

  public get audioTracks(): readonly TrackSampleTable[] {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  /**
   * Until the last sample of any track stops showing.
   */
  public get duration(): Seconds {
    return seconds(Math.max(0, ...this.tracks.map((track) => track.end)));
  }

  public trackWithId(trackId: number): TrackSampleTable | undefined {
    return this.tracks.find((track) => track.trackId === trackId);
  }
}
