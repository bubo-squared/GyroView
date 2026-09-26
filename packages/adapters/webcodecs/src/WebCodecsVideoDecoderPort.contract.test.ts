import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import type { DemuxedInput } from '@gyroview/core';
import {
  describeVideoDecoderPortContract,
  InMemoryRandomAccessSource,
} from '@gyroview/core/testing';
import { afterAll, beforeAll, describe } from 'vitest';

import { WebCodecsVideoDecoderPort } from './WebCodecsVideoDecoderPort';
import fixtureUrl from '../../../../test/fixtures/synthetic/dual-track-64px-10fps-3s.mp4?url';

/**
 * The fixture is demuxed once for every test: the tests read its track, and only the decoders
 * are theirs.
 */
describe('WebCodecsVideoDecoderPort over the synthetic fixture', () => {
  let input: DemuxedInput;

  beforeAll(async () => {
    const response = await fetch(fixtureUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    input = await new MediabunnyDemuxer().open(new InMemoryRandomAccessSource(bytes), 'synthetic');
  });

  afterAll(() => {
    input.dispose();
  });

  describeVideoDecoderPortContract('WebCodecsVideoDecoderPort', () => {
    const [track] = input.videoTracks;
    if (!track) throw new Error('the fixture has no video track');
    return Promise.resolve({ port: new WebCodecsVideoDecoderPort(), track });
  });
});
