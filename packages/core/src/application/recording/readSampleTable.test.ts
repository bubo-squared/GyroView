import { describe, expect, it } from 'vitest';

import { readSampleTable } from './readSampleTable';
import { encodeBox } from '../../testing/encodeBox';
import { buildMp4File, type FixtureTrack } from '../../testing/mp4/buildMp4File';
import { videoSampleEntry } from '../../testing/mp4/sampleEntries';
import { SparseRandomAccessSource } from '../../testing/SparseRandomAccessSource';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';

const LENS: FixtureTrack = {
  trackId: 1,
  handler: 'vide',
  sampleEntry: videoSampleEntry({
    type: 'avc1',
    width: 64,
    height: 64,
    configuration: encodeBox('avcC', new Uint8Array(5)),
  }),
  timescale: 1000,
  samples: Array.from({ length: 50 }, () => ({
    bytes: new Uint8Array(1000),
    duration: 40,
    isSync: true,
  })),
};

/**
 * The file's bytes where a reader may look (the boxes' headers, the file type and the movie),
 * and zeros over the media data, which opening must not read.
 */
function sourceOf(file: ReturnType<typeof buildMp4File>): SparseRandomAccessSource {
  const source = new SparseRandomAccessSource(file.bytes.byteLength);
  source.place(0, file.bytes.subarray(0, file.mediaData.offset + 16));
  source.place(file.movieBox.offset, file.bytes.subarray(file.movieBox.offset));
  return source;
}

describe('readSampleTable', () => {
  it('reads the movie box once, after a media data box with a 64-bit size, without reading the media', async () => {
    const file = buildMp4File([LENS], { mediaDataSize: '64-bit' });
    const source = sourceOf(file);

    const { table } = await readSampleTable(source);

    expect(table.videoTracks[0]?.rangeOf(49).offset).toBe(file.sampleOffsets[0]?.[49]);
    const readsOfMedia = source.reads.filter(
      (range) => range.end > file.mediaData.offset + 16 && range.offset < file.mediaData.end,
    );
    expect(readsOfMedia).toEqual([]);
    expect(
      source.reads.filter((range) => range.offset === file.movieBox.offset && range.length > 16),
    ).toHaveLength(1);
  });

  it('hands out the file type and the movie box together, for the codec reader', async () => {
    const file = buildMp4File([LENS], { movieBox: 'before-media' });
    const { movieBytes } = await readSampleTable(new InMemoryRandomAccessSource(file.bytes));
    const fileTypeEnd = file.movieBox.offset;
    expect(movieBytes.subarray(0, fileTypeEnd)).toEqual(file.bytes.subarray(0, fileTypeEnd));
    expect(movieBytes.subarray(fileTypeEnd)).toEqual(
      file.bytes.subarray(file.movieBox.offset, file.movieBox.end),
    );
  });

  it('refuses a file without a movie box', async () => {
    const source = new InMemoryRandomAccessSource(encodeBox('ftyp', new Uint8Array(8)));
    await expect(readSampleTable(source)).rejects.toMatchObject({ code: 'unsupported-container' });
  });
});
