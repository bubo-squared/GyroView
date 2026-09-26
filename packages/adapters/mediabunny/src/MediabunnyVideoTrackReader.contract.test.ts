import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DemuxedInput } from '@gyroview/core';
import {
  describeVideoTrackReaderContract,
  InMemoryRandomAccessSource,
  type VideoTrackReaderExpectations,
} from '@gyroview/core/testing';
import { afterAll, beforeAll, describe } from 'vitest';

import { MediabunnyDemuxer } from './MediabunnyDemuxer';

const SYNTHETIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic',
);

/**
 * The contract over the first video track of a fixture, demuxed once for every test; the
 * contract only reads the track.
 */
function describeContractOver(fixture: string, expected: VideoTrackReaderExpectations): void {
  describe(`MediabunnyVideoTrackReader over ${fixture}`, () => {
    let input: DemuxedInput;

    beforeAll(async () => {
      const bytes = readFileSync(path.join(SYNTHETIC, fixture));
      input = await new MediabunnyDemuxer().open(new InMemoryRandomAccessSource(bytes), fixture);
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
      expected,
    );
  });
}

describeContractOver('dual-track-64px-10fps-3s.mp4', {
  frameCount: 30,
  frameRate: 10,
  framesPerGop: 10,
});

// An edit list starts this track at 0.7 s; no real recording is known to (verify on real file).
describeContractOver('late-start-64px-10fps-3s.mp4', {
  frameCount: 30,
  frameRate: 10,
  framesPerGop: 10,
  firstTimestamp: 0.7,
});
