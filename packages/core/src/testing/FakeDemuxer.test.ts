import { describe, expect, it } from 'vitest';

import { FakeDemuxer } from './FakeDemuxer';
import { FakeVideoTrack } from './FakeVideoTrack';
import { InMemoryRandomAccessSource } from './InMemoryRandomAccessSource';
import { seconds } from '../shared/units/time';

const TRACK = new FakeVideoTrack({ trackIndex: 0, frameRate: 10, frameCount: 5, framesPerGop: 5 });

describe('FakeDemuxer', () => {
  it('opens a registered source by identity and counts open inputs until disposal', async () => {
    const source = new InMemoryRandomAccessSource(new Uint8Array(4));
    const demuxer = new FakeDemuxer([{ source, duration: seconds(0.5), videoTracks: [TRACK] }]);

    const input = await demuxer.open(source, 'clip.insv');

    expect(input.name).toBe('clip.insv');
    expect(input.duration).toBe(0.5);
    expect(input.videoTracks).toEqual([TRACK]);
    expect(input.audioTracks).toEqual([]);
    expect(demuxer.openCount).toBe(1);
    input.dispose();
    expect(demuxer.openCount).toBe(0);
  });

  it('opens a registered name when no source was given for it', async () => {
    const demuxer = new FakeDemuxer([{ name: 'by-name', duration: seconds(1), videoTracks: [] }]);
    const input = await demuxer.open(new InMemoryRandomAccessSource(new Uint8Array()), 'by-name');
    expect(input.name).toBe('by-name');
  });

  it('rejects an unknown source like the real adapter rejects a non-media file', async () => {
    const demuxer = new FakeDemuxer([]);
    const unknown = new InMemoryRandomAccessSource(new Uint8Array());
    await expect(demuxer.open(unknown, 'noise.bin')).rejects.toMatchObject({
      code: 'unsupported-layout',
      message: 'noise.bin is not a readable media file',
    });
  });
});
