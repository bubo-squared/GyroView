import { MediabunnyAudioPackager, MediabunnyCodecReader } from '@gyroview/adapter-mediabunny';
import type { AudioSegmentSource } from '@gyroview/core';
import { openDownloadedFile } from '@gyroview/core/testing';

import fixtureUrl from '../../../../../test/fixtures/synthetic/dual-track-aac-64px-10fps-3s.mp4?url';

export interface FixtureAudio {
  readonly source: AudioSegmentSource;
  dispose(): void;
}

/**
 * The three-second AAC track of the synthetic fixture, read through the download as the player
 * reads it, as fragments the source buffer takes.
 */
export async function openFixtureAudio(): Promise<FixtureAudio> {
  const response = await fetch(fixtureUrl);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const file = await openDownloadedFile(bytes, new MediabunnyCodecReader());
  const [audio] = file.audioTracks;
  if (!audio) throw new Error('fixture has no audio track');
  return {
    source: new MediabunnyAudioPackager().segmentsOf(audio.samples, audio.configuration),
    dispose: (): void => {
      file.dispose();
    },
  };
}
