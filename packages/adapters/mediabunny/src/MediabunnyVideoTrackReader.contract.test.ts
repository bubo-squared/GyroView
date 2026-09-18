import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  describeVideoTrackReaderContract,
  InMemoryRandomAccessSource,
} from '@gyroview/core/testing';

import { MediabunnyDemuxer } from './MediabunnyDemuxer';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic/dual-track-64px-10fps-3s.mp4',
);

describeVideoTrackReaderContract(
  'MediabunnyVideoTrackReader',
  async () => {
    const input = await new MediabunnyDemuxer().open(
      new InMemoryRandomAccessSource(readFileSync(FIXTURE)),
      'synthetic',
    );
    const [track] = input.videoTracks;
    if (!track) throw new Error('the fixture has no video track');
    return track;
  },
  { frameCount: 30, frameRate: 10, framesPerGop: 10 },
);
