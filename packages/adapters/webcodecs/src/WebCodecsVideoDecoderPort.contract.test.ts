import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import {
  describeVideoDecoderPortContract,
  InMemoryRandomAccessSource,
} from '@gyroview/core/testing';

import { WebCodecsVideoDecoderPort } from './WebCodecsVideoDecoderPort';
import fixtureUrl from '../../../../test/fixtures/synthetic/dual-track-64px-10fps-3s.mp4?url';

describeVideoDecoderPortContract('WebCodecsVideoDecoderPort', async () => {
  const response = await fetch(fixtureUrl);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const input = await new MediabunnyDemuxer().open(
    new InMemoryRandomAccessSource(bytes),
    'synthetic',
  );
  const [track] = input.videoTracks;
  if (!track) throw new Error('the fixture has no video track');
  return { port: new WebCodecsVideoDecoderPort(), track };
});
