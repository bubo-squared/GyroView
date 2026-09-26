import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { seconds, type DemuxedInput } from '@gyroview/core';
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

  it('finds the key packet at or before a time', async () => {
    const track = input.videoTracks[0]!;
    const midSecond = await track.keyPacketAt(seconds(1.55));
    const atStart = await track.keyPacketAt(seconds(0));
    const nearEnd = await track.keyPacketAt(seconds(2.9));
    expect(midSecond?.timestamp).toBe(1);
    expect(atStart?.timestamp).toBe(0);
    expect(nearEnd).toMatchObject({ timestamp: 2, isKeyFrame: true });
  });

  it('iterates packets in decode order from a key packet to the end', async () => {
    const track = input.videoTracks[1]!;
    const start = await track.keyPacketAt(seconds(2));
    const timestamps: number[] = [];
    for await (const packet of track.packetsFrom(start!)) timestamps.push(packet.timestamp);
    expect(timestamps).toHaveLength(10);
    expect(timestamps[0]).toBe(2);
    expect(timestamps.at(-1)).toBeCloseTo(2.9, 6);
  });

  it('reports the frame count and every sample timestamp', async () => {
    const track = input.videoTracks[0]!;
    await expect(track.frameCount()).resolves.toBe(30);
    const timestamps = await track.sampleTimestamps();
    expect(timestamps).toHaveLength(30);
    expect(timestamps[10]).toBeCloseTo(1, 6);
  });

  it('refuses to iterate from a packet it did not hand out', async () => {
    const track = input.videoTracks[0]!;
    const foreign = {
      timestamp: seconds(0),
      duration: seconds(0.1),
      isKeyFrame: true,
      data: new Uint8Array(),
    };
    const iterator = track.packetsFrom(foreign)[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({ code: 'invariant-violation' });
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

  it('describes the audio track', () => {
    const [audio] = input.audioTracks;
    expect(audio?.description).toEqual({ trackIndex: 0, codec: 'mp4a.40.2' });
  });
});
