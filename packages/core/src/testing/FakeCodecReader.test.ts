import { describe, expect, it } from 'vitest';

import { describeCodecReaderContract } from './CodecReader.contract';
import { FakeCodecReader } from './FakeCodecReader';
import type { ContainerCodecs } from '../ports/CodecReader';
import { UNSPECIFIED_COLOUR } from '../domain/colour/TrackColour';

const MOVIE = Uint8Array.of(1, 2, 3);

function lensCodec(trackId: number, trackIndex: number): ContainerCodecs['video'][number] {
  const size = { codedWidth: 64, codedHeight: 64 };
  return {
    trackId,
    description: { trackIndex, codec: 'avc1.64000a', ...size, colour: UNSPECIFIED_COLOUR },
    configuration: { codec: 'avc1.64000a', ...size, description: undefined, isFullRange: false },
  };
}

const CODECS: ContainerCodecs = {
  video: [lensCodec(1, 0), lensCodec(3, 1)],
  audio: [
    {
      trackId: 2,
      configuration: {
        codec: 'mp4a.40.2',
        sampleRate: 48_000,
        numberOfChannels: 2,
        description: undefined,
      },
    },
  ],
};

describeCodecReaderContract(() =>
  Promise.resolve({
    reader: new FakeCodecReader([[MOVIE, CODECS]]),
    movieBytes: MOVIE,
    videoTrackIds: [1, 3],
    videoColours: [UNSPECIFIED_COLOUR, UNSPECIFIED_COLOUR],
    audioTrackIds: [2],
    notMovie: Uint8Array.of(9),
  }),
);

describe('FakeCodecReader', () => {
  it('knows movie bytes by their content, as a file read afresh gives new ones', async () => {
    const reader = new FakeCodecReader([[MOVIE, CODECS]]);
    await expect(reader.read(Uint8Array.of(1, 2, 3))).resolves.toBe(CODECS);
  });
});
