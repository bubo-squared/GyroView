import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSampleTable, type VideoTrackCodec } from '@gyroview/core';
import {
  buildMp4File,
  describeCodecReaderContract,
  encodeBox,
  InMemoryRandomAccessSource,
  videoSampleEntry,
} from '@gyroview/core/testing';
import { ALL_FORMATS, BufferSource, Input, type InputVideoTrack } from 'mediabunny';
import { describe, expect, it } from 'vitest';

import { videoConfigurationOf } from './decoderConfigurations';
import { MediabunnyCodecReader } from './MediabunnyCodecReader';

const SYNTHETIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic',
);
const FIXTURES = [
  'dual-track-64px-10fps-3s.mp4',
  'dual-track-aac-64px-10fps-3s.mp4',
  'dual-track-aac-moov-at-end-64px-10fps-3s.mp4',
  'hevc-b-frames-dual-track-64px-10fps-3s.mp4',
  'late-start-64px-10fps-3s.mp4',
];

function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(SYNTHETIC, name)));
}

/**
 * A video track's codec as mediabunny tells it reading the whole file, samples and all.
 */
async function codecOf(track: InputVideoTrack, trackIndex: number): Promise<VideoTrackCodec> {
  const config = await track.getDecoderConfig();
  if (!config) throw new Error(`video track ${trackIndex} has no decoder configuration`);
  const description = {
    trackIndex,
    codedWidth: await track.getCodedWidth(),
    codedHeight: await track.getCodedHeight(),
    codec: config.codec,
  };
  return {
    trackId: track.id,
    description,
    configuration: videoConfigurationOf(config, description),
  };
}

async function movieBytesOf(bytes: Uint8Array): Promise<Uint8Array> {
  const { movieBytes } = await readSampleTable(new InMemoryRandomAccessSource(bytes));
  return movieBytes;
}

describeCodecReaderContract(async () => ({
  reader: new MediabunnyCodecReader(),
  movieBytes: await movieBytesOf(fixtureBytes('dual-track-aac-64px-10fps-3s.mp4')),
  videoTrackIds: [1, 2],
  audioTrackIds: [3],
  notMovie: Uint8Array.of(0, 0, 0, 8, 1, 2, 3, 4),
}));

describe('MediabunnyCodecReader', () => {
  it.each(FIXTURES)(
    'tells the video codecs of %s as mediabunny reading the whole file does',
    async (name) => {
      const bytes = fixtureBytes(name);
      const codecs = await new MediabunnyCodecReader().read(await movieBytesOf(bytes));
      const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
      try {
        const tracks = await input.getVideoTracks();
        const theirs = await Promise.all(tracks.map((track, index) => codecOf(track, index)));
        expect(codecs.video).toEqual(theirs);
      } finally {
        input.dispose();
      }
    },
  );

  it('tells the sound codec as mediabunny reading the whole file does', async () => {
    const bytes = fixtureBytes('dual-track-aac-64px-10fps-3s.mp4');
    const codecs = await new MediabunnyCodecReader().read(await movieBytesOf(bytes));
    const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
    try {
      const [track] = await input.getAudioTracks();
      const config = await track?.getDecoderConfig();
      expect(codecs.audio.map((codec) => codec.configuration)).toEqual([
        {
          codec: config?.codec,
          sampleRate: config?.sampleRate,
          numberOfChannels: config?.numberOfChannels,
          description: expect.any(Uint8Array) as Uint8Array,
        },
      ]);
    } finally {
      input.dispose();
    }
  });

  it('refuses a video track whose sample entry carries no codec configuration', async () => {
    const lens = {
      trackId: 1,
      handler: 'vide',
      sampleEntry: videoSampleEntry({
        type: 'avc1',
        width: 64,
        height: 64,
        configuration: encodeBox('free', new Uint8Array()),
      }),
      timescale: 1000,
      samples: [{ bytes: new Uint8Array(8), duration: 40, isSync: true }],
    };
    const movieBytes = await movieBytesOf(buildMp4File([lens]).bytes);
    await expect(new MediabunnyCodecReader().read(movieBytes)).rejects.toMatchObject({
      code: 'codec-unsupported',
    });
  });
});
