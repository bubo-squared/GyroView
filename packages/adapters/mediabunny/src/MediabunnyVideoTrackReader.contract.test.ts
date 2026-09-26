import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DemuxedInput } from '@gyroview/core';
import {
  describeVideoTrackReaderContract,
  InMemoryRandomAccessSource,
} from '@gyroview/core/testing';
import { afterAll, beforeAll, describe } from 'vitest';

import { MediabunnyDemuxer } from './MediabunnyDemuxer';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic/dual-track-64px-10fps-3s.mp4',
);

/**
 * The fixture is demuxed once for every test; the contract only reads the track.
 */
describe('MediabunnyVideoTrackReader over the synthetic fixture', () => {
  let input: DemuxedInput;

  beforeAll(async () => {
    input = await new MediabunnyDemuxer().open(
      new InMemoryRandomAccessSource(readFileSync(FIXTURE)),
      'synthetic',
    );
  });

  afterAll(() => {
    input.dispose();
  });

  describeVideoTrackReaderContract(
    'MediabunnyVideoTrackReader',
    () => {
      const [track] = input.videoTracks;
      if (!track) throw new Error('the fixture has no video track');
      return Promise.resolve(track);
    },
    { frameCount: 30, frameRate: 10, framesPerGop: 10 },
  );
});
