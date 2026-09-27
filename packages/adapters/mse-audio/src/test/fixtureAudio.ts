import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import type { AudioSegmentSource } from '@gyroview/core';
import { InMemoryRandomAccessSource } from '@gyroview/core/testing';

import fixtureUrl from '../../../../../test/fixtures/synthetic/dual-track-aac-64px-10fps-3s.mp4?url';

export interface FixtureAudio {
  readonly source: AudioSegmentSource;
  dispose(): void;
}

/**
 * The three-second AAC track of the synthetic fixture, as fragments the source buffer takes.
 */
export async function openFixtureAudio(): Promise<FixtureAudio> {
  const response = await fetch(fixtureUrl);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const input = await new MediabunnyDemuxer().open(
    new InMemoryRandomAccessSource(bytes),
    'aac fixture',
  );
  const [audio] = input.audioTracks;
  if (!audio) throw new Error('fixture has no audio track');
  return {
    source: await audio.openSegments(),
    dispose: (): void => {
      input.dispose();
    },
  };
}
