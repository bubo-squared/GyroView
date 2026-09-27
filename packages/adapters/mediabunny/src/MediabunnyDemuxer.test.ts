import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GyroViewError, type DemuxedInput } from '@gyroview/core';
import { describeDemuxerContract, InMemoryRandomAccessSource } from '@gyroview/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediabunnyDemuxer } from './MediabunnyDemuxer';

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures',
);
const SYNTHETIC = path.join(FIXTURES, 'synthetic/dual-track-64px-10fps-3s.mp4');
const SYNTHETIC_WITH_AUDIO = path.join(FIXTURES, 'synthetic/dual-track-aac-64px-10fps-3s.mp4');
const ONE_R_TRAILER_ONLY = path.join(FIXTURES, 'thirdparty/insta360py/sample.insv');

describe('MediabunnyDemuxer on the synthetic dual-track fixture', () => {
  let input: DemuxedInput;

  beforeAll(async () => {
    input = await new MediabunnyDemuxer().open(
      new InMemoryRandomAccessSource(readFileSync(SYNTHETIC)),
      'synthetic',
    );
  });

  afterAll(() => {
    input.dispose();
  });

  it("passes a caller's abort on as it is, not as an unreadable file", async () => {
    const aborting = {
      size: (): Promise<number> => Promise.resolve(1_000_000),
      read: (): Promise<Uint8Array> => Promise.reject(new DOMException('aborted', 'AbortError')),
    };
    await expect(new MediabunnyDemuxer().open(aborting, 'aborted.insv')).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it("passes the source's own typed failure on as it is", async () => {
    const unreadable = new GyroViewError('source-unreadable', 'the network went away');
    const failing = {
      size: (): Promise<number> => Promise.resolve(1_000_000),
      read: (): Promise<Uint8Array> => Promise.reject(unreadable),
    };
    await expect(new MediabunnyDemuxer().open(failing, 'failing.insv')).rejects.toBe(unreadable);
  });

  it('describes both video tracks and the duration', () => {
    expect(input.name).toBe('synthetic');
    expect(input.duration).toBeCloseTo(3, 3);
    expect(input.audioTracks).toEqual([]);
    expect(input.videoTracks.map((track) => track.description)).toEqual([
      {
        trackIndex: 0,
        codedWidth: 64,
        codedHeight: 64,
        codec: expect.stringMatching(/^avc1\./) as string,
      },
      {
        trackIndex: 1,
        codedWidth: 64,
        codedHeight: 64,
        codec: expect.stringMatching(/^avc1\./) as string,
      },
    ]);
  });

  it('exposes a decoder configuration with the out-of-band description', async () => {
    const configuration = await input.videoTracks[0]!.decoderConfiguration();
    expect(configuration.codec).toMatch(/^avc1\./);
    expect(configuration).toMatchObject({ codedWidth: 64, codedHeight: 64 });
    expect(configuration.description?.byteLength).toBeGreaterThan(0);
  });
});

describeDemuxerContract(() =>
  Promise.resolve({
    demuxer: new MediabunnyDemuxer(),
    media: new InMemoryRandomAccessSource(readFileSync(SYNTHETIC_WITH_AUDIO)),
    videoTrackCount: 2,
    audioTrackCount: 1,
    notMedia: new InMemoryRandomAccessSource(new Uint8Array(4096).fill(0x42)),
  }),
);

describe('MediabunnyDemuxer on a trailer-only file', () => {
  it('still lists the tracks when the media data was stripped', async () => {
    const input = await new MediabunnyDemuxer().open(
      new InMemoryRandomAccessSource(readFileSync(ONE_R_TRAILER_ONLY)),
    );
    try {
      expect(input.videoTracks.length).toBeGreaterThan(0);
    } finally {
      input.dispose();
    }
  });
});

describe('MediabunnyDemuxer on the synthetic fixture with an AAC track', () => {
  let input: DemuxedInput;

  beforeAll(async () => {
    input = await new MediabunnyDemuxer().open(
      new InMemoryRandomAccessSource(readFileSync(SYNTHETIC_WITH_AUDIO)),
      'synthetic with audio',
    );
  });

  afterAll(() => {
    input.dispose();
  });

  it('offers the audio track as AAC in fragmented MP4', async () => {
    const [audio] = input.audioTracks;
    const segments = await audio?.openSegments();
    expect(segments?.mimeType).toBe('audio/mp4; codecs="mp4a.40.2"');
  });
});
