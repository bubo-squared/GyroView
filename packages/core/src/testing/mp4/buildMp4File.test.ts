import { describe, expect, it } from 'vitest';

import { buildMp4File, type FixtureTrack } from './buildMp4File';
import { audioSampleEntry, videoSampleEntry } from './sampleEntries';
import { boxHeaderOf } from '../../domain/format/boxes/boxHeader';
import { scanBoxes } from '../../domain/format/boxes/scanBoxes';
import { ByteReader } from '../../shared/binary/ByteReader';
import { encodeBox } from '../encodeBox';
import { InMemoryRandomAccessSource } from '../InMemoryRandomAccessSource';

const CONTAINERS = new Set(['moov', 'trak', 'edts', 'mdia', 'minf', 'dinf', 'stbl']);

function samplesOf(count: number, firstByte: number): FixtureTrack['samples'] {
  return Array.from({ length: count }, (_, index) => ({
    bytes: new Uint8Array(10 + index).fill(firstByte + index),
    duration: 100,
    isSync: index % 3 === 0,
  }));
}

function videoTrack(overrides: Partial<FixtureTrack> = {}): FixtureTrack {
  return {
    trackId: 1,
    handler: 'vide',
    sampleEntry: videoSampleEntry({
      type: 'avc1',
      width: 64,
      height: 48,
      configuration: encodeBox('avcC', new Uint8Array([1, 100, 0, 10, 0xff])),
    }),
    timescale: 1000,
    samples: samplesOf(6, 1),
    ...overrides,
  };
}

function audioTrack(): FixtureTrack {
  return {
    trackId: 2,
    handler: 'soun',
    sampleEntry: audioSampleEntry({
      type: 'mp4a',
      channelCount: 2,
      sampleRate: 48_000,
      configuration: encodeBox('esds', new Uint8Array(4)),
    }),
    timescale: 48_000,
    samples: samplesOf(6, 101).map((sample) => ({ ...sample, isSync: true })),
    syncSamples: 'unlisted',
  };
}

async function topLevelTypes(bytes: Uint8Array): Promise<string[]> {
  const boxes = await scanBoxes(new InMemoryRandomAccessSource(bytes), bytes.byteLength);
  return boxes.map((box) => box.type);
}

/**
 * Every box type inside the movie box, depth first.
 */
function typesWithin(bytes: Uint8Array, offset = 0, end = bytes.byteLength): string[] {
  const types: string[] = [];
  let at = offset;
  while (at < end) {
    const header = boxHeaderOf(new ByteReader(bytes.subarray(at, end)), end - at);
    if (!header) throw new Error(`no box at ${at}`);
    types.push(header.type);
    if (CONTAINERS.has(header.type)) {
      types.push(...typesWithin(bytes, at + header.headerSize, at + header.size));
    }
    at += header.size;
  }
  return types;
}

function movieTypes(file: ReturnType<typeof buildMp4File>): string[] {
  const { offset, end } = file.movieBox;
  return typesWithin(file.bytes.subarray(offset, end));
}

function expectSamplesAtTheirOffsets(
  file: ReturnType<typeof buildMp4File>,
  tracks: FixtureTrack[],
): void {
  for (const [trackIndex, track] of tracks.entries()) {
    for (const [sampleIndex, sample] of track.samples.entries()) {
      const offset = file.sampleOffsets[trackIndex]?.[sampleIndex] ?? -1;
      expect(file.bytes.subarray(offset, offset + sample.bytes.byteLength)).toEqual(sample.bytes);
    }
  }
}

describe('buildMp4File', () => {
  it('writes the file type, the media data and then the movie, as the cameras do', async () => {
    const file = buildMp4File([videoTrack()]);
    expect(await topLevelTypes(file.bytes)).toEqual(['ftyp', 'mdat', 'moov']);
    expect(file.movieBox.end).toBe(file.bytes.byteLength);
  });

  it('puts the movie before the media data when asked', async () => {
    const tracks = [videoTrack()];
    const file = buildMp4File(tracks, { movieBox: 'before-media' });
    expect(await topLevelTypes(file.bytes)).toEqual(['ftyp', 'moov', 'mdat']);
    expectSamplesAtTheirOffsets(file, tracks);
  });

  it('describes a track with the boxes a sample table needs', () => {
    const file = buildMp4File([videoTrack()]);
    expect(movieTypes(file)).toEqual([
      'moov',
      'mvhd',
      'trak',
      'tkhd',
      'mdia',
      'mdhd',
      'hdlr',
      'minf',
      'vmhd',
      'dinf',
      'dref',
      'stbl',
      'stsd',
      'stts',
      'stss',
      'stsc',
      'stsz',
      'stco',
    ]);
  });

  it('places every sample where it says, the tracks interleaved chunk by chunk', () => {
    const tracks = [videoTrack(), audioTrack()];
    const file = buildMp4File(tracks);
    expectSamplesAtTheirOffsets(file, tracks);
    const [video = [], audio = []] = file.sampleOffsets;
    expect(video[0]).toBeLessThan(audio[0] ?? 0);
    expect(audio[0]).toBeLessThan(video[1] ?? 0);
  });

  it('keeps the samples of one chunk together', () => {
    const tracks = [videoTrack({ chunkSizes: [2, 1] }), audioTrack()];
    const file = buildMp4File(tracks);
    expectSamplesAtTheirOffsets(file, tracks);
    const [video = []] = file.sampleOffsets;
    expect((video[1] ?? 0) - (video[0] ?? 0)).toBe(10);
  });

  it('writes 64-bit sizes and offsets when asked, as a recording over 4 GiB has', () => {
    const tracks = [videoTrack()];
    const file = buildMp4File(tracks, { mediaDataSize: '64-bit', chunkOffsets: '64-bit' });
    const mediaData = boxHeaderOf(
      new ByteReader(file.bytes.subarray(file.mediaData.offset)),
      Infinity,
    );
    expect(mediaData?.headerSize).toBe(16);
    expect(movieTypes(file)).toContain('co64');
    expect(movieTypes(file)).not.toContain('stco');
    expectSamplesAtTheirOffsets(file, tracks);
  });

  it('leaves out the sync sample table of a track whose every sample is one', () => {
    const file = buildMp4File([audioTrack()]);
    expect(movieTypes(file)).not.toContain('stss');
  });

  it('writes composition offsets and an edit list only for a track that has them', () => {
    const plain = movieTypes(buildMp4File([videoTrack()]));
    expect(plain).not.toContain('ctts');
    expect(plain).not.toContain('edts');
    const shifted = videoTrack({
      compositionOffsets: 'version-1',
      edits: [
        { segmentDuration: 100, mediaTime: -1 },
        { segmentDuration: 600, mediaTime: 0 },
      ],
    });
    expect(movieTypes(buildMp4File([shifted]))).toEqual(
      expect.arrayContaining(['ctts', 'edts', 'elst']),
    );
  });
});
