import { describe, expect, it } from 'vitest';

import { boxesIn, type Mp4Box } from './movieBoxes';
import { sampleLocationsOf } from './sampleLocations';
import { encodeBox } from '../../../testing/encodeBox';
import type { FixtureTrack } from '../../../testing/mp4/FixtureTrack';
import { encodeSampleTable, type ChunkPlacement } from '../../../testing/mp4/encodeSampleTable';
import { captureError } from '../../../../test/support/errors';

function trackOfSizes(sizes: readonly number[]): FixtureTrack {
  return {
    trackId: 1,
    handler: 'vide',
    sampleEntry: encodeBox('avc1', new Uint8Array(78)),
    timescale: 1000,
    samples: sizes.map((size) => ({ bytes: new Uint8Array(size), duration: 40, isSync: true })),
  };
}

function sampleTableBoxes(track: FixtureTrack, placement: ChunkPlacement): Mp4Box[] {
  const [sampleTable] = boxesIn(encodeSampleTable(track, placement));
  return boxesIn(sampleTable?.body ?? new Uint8Array());
}

function locate(
  sizes: readonly number[],
  placement: ChunkPlacement,
): { offsets: number[]; sizes: number[] } {
  const locations = sampleLocationsOf(sampleTableBoxes(trackOfSizes(sizes), placement));
  return { offsets: [...locations.offsets], sizes: [...locations.sizes] };
}

describe('sampleLocationsOf', () => {
  it('puts each sample at its chunk when every chunk holds one, as the cameras write them', () => {
    const placement: ChunkPlacement = {
      offsets: [100, 500, 900],
      sampleCounts: [1, 1, 1],
      offsetSize: '32-bit',
    };
    expect(locate([30, 40, 50], placement)).toEqual({
      offsets: [100, 500, 900],
      sizes: [30, 40, 50],
    });
  });

  it('lays the samples of a chunk one after another, in chunks of changing size', () => {
    const placement: ChunkPlacement = {
      offsets: [100, 1000, 2000],
      sampleCounts: [2, 1, 3],
      offsetSize: '32-bit',
    };
    expect(locate([10, 20, 30, 40, 50, 60], placement).offsets).toEqual([
      100, 110, 1000, 2000, 2040, 2090,
    ]);
  });

  it('reads 64-bit chunk offsets, past 4 GiB', () => {
    const placement: ChunkPlacement = {
      offsets: [6_868_806_542, 6_868_807_000],
      sampleCounts: [1, 1],
      offsetSize: '64-bit',
    };
    expect(locate([7, 8], placement).offsets).toEqual([6_868_806_542, 6_868_807_000]);
  });

  it('gives every sample the size they share when the table lists one', () => {
    const placement: ChunkPlacement = { offsets: [0], sampleCounts: [3], offsetSize: '32-bit' };
    expect(locate([505, 505, 505], placement)).toEqual({
      offsets: [0, 505, 1010],
      sizes: [505, 505, 505],
    });
  });

  it('refuses a table whose chunks hold fewer samples than it counts', () => {
    const placement: ChunkPlacement = { offsets: [0], sampleCounts: [1], offsetSize: '32-bit' };
    const boxes = sampleTableBoxes(trackOfSizes([5, 6]), placement);
    expect(captureError(() => sampleLocationsOf(boxes))).toMatchObject({
      code: 'unsupported-container',
    });
  });

  it('refuses a table without chunk offsets', () => {
    const placement: ChunkPlacement = { offsets: [0], sampleCounts: [1], offsetSize: '32-bit' };
    const boxes = sampleTableBoxes(trackOfSizes([5]), placement).filter(
      (box) => box.type !== 'stco',
    );
    expect(captureError(() => sampleLocationsOf(boxes))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('chunk offsets') as string,
    });
  });
});
