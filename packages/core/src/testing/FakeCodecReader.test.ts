import { describeCodecReaderContract } from './CodecReader.contract';
import { FakeCodecReader } from './FakeCodecReader';
import type { ContainerCodecs } from '../ports/CodecReader';

const MOVIE = Uint8Array.of(1, 2, 3);

function lensCodec(trackId: number, trackIndex: number): ContainerCodecs['video'][number] {
  const size = { codedWidth: 64, codedHeight: 64 };
  return {
    trackId,
    description: { trackIndex, codec: 'avc1.64000a', ...size },
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
    audioTrackIds: [2],
    notMovie: Uint8Array.of(9),
  }),
);
