import { describe, expect, it } from 'vitest';

import { lensMp4File } from './lensMp4File';
import { readSampleTable } from '../../application/recording/readSampleTable';
import { InMemoryRandomAccessSource } from '../InMemoryRandomAccessSource';

async function tableOf(bytes: Uint8Array): ReturnType<typeof readSampleTable> {
  return readSampleTable(new InMemoryRandomAccessSource(bytes));
}

describe('lensMp4File', () => {
  it('holds square lens tracks with a key frame every group, their ids counted from 1', async () => {
    const { table } = await tableOf(lensMp4File({ lenses: 2 }).bytes);
    expect(table.videoTracks.map((track) => track.trackId)).toEqual([1, 2]);
    const [lens] = table.videoTracks;
    expect(lens?.sampleCount).toBe(30);
    expect(lens?.timestampOf(10)).toBeCloseTo(1, 9);
    expect([0, 1, 10].map((sample) => lens?.isSync(sample))).toEqual([true, false, true]);
    expect(table.duration).toBeCloseTo(3, 9);
  });

  it('lasts as many frames as asked', async () => {
    const { table } = await tableOf(lensMp4File({ lenses: 1, frames: 25 }).bytes);
    expect(table.duration).toBeCloseTo(2.5, 9);
  });

  it('holds a sound track after the lenses when asked', async () => {
    const { table } = await tableOf(lensMp4File({ lenses: 1, hasSound: true }).bytes);
    expect(table.audioTracks.map((track) => track.trackId)).toEqual([2]);
  });

  it('lists no key frame at all when asked, as a track decoding cannot start in', async () => {
    const { table } = await tableOf(lensMp4File({ lenses: 1, keyframes: 'none' }).bytes);
    expect(table.videoTracks[0]?.syncSampleAtOrAfter(0)).toBeUndefined();
  });
});
