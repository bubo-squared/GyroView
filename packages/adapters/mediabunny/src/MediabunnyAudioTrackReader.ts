import type { AudioSegmentSource, AudioTrackDescription, AudioTrackReader } from '@gyroview/core';
import type { InputAudioTrack } from 'mediabunny';

import { MediabunnyAudioSegments } from './MediabunnyAudioSegments';

const UNKNOWN_CODEC = 'unknown';

/**
 * AudioTrackReader over one mediabunny audio track. An unknown codec is described, not refused:
 * the picture plays without sound rather than not at all.
 */
export class MediabunnyAudioTrackReader implements AudioTrackReader {
  private constructor(
    private readonly track: InputAudioTrack,
    public readonly description: AudioTrackDescription,
  ) {}

  public static async open(
    track: InputAudioTrack,
    trackIndex: number,
  ): Promise<MediabunnyAudioTrackReader> {
    const codec = await track.getCodecParameterString();
    return new MediabunnyAudioTrackReader(track, { trackIndex, codec: codec ?? UNKNOWN_CODEC });
  }

  public openSegments(): Promise<AudioSegmentSource> {
    return MediabunnyAudioSegments.open(this.track, this.description);
  }
}
