import { describe, expect, it } from 'vitest';

import { boxesIn, type Mp4Box } from './movieBoxes';
import { movieTimescaleOf, trackBoxesOf, trackHeadersOf, type TrackBoxes } from './trackHeaders';
import { encodeBox } from '../../../testing/encodeBox';
import { buildMp4File, type Mp4FileLayout } from '../../../testing/mp4/buildMp4File';
import type { FixtureTrack } from '../../../testing/mp4/FixtureTrack';
import { audioSampleEntry, videoSampleEntry } from '../../../testing/mp4/sampleEntries';
import { captureError } from '../../../../test/support/errors';

/**
 * An `avcC` whose byte 4 says NAL units have 4-byte lengths, and an `hvcC` whose byte 21 says
 * 2-byte ones: the low two bits hold the length size less one.
 */
const AVC_CONFIGURATION = encodeBox('avcC', Uint8Array.of(1, 100, 0, 31, 0xff));
const HEVC_CONFIGURATION = encodeBox(
  'hvcC',
  Uint8Array.from({ length: 23 }, (_, index) => (index === 21 ? 0xfd : 0)),
);

function sampleOf(): FixtureTrack['samples'][number] {
  return { bytes: new Uint8Array(4), duration: 1001, isSync: true };
}

function lens(trackId: number, type: string, configuration: Uint8Array): FixtureTrack {
  return {
    trackId,
    handler: 'vide',
    sampleEntry: videoSampleEntry({ type, width: 2880, height: 2880, configuration }),
    timescale: 60_000,
    samples: [sampleOf()],
  };
}

const SOUND: FixtureTrack = {
  trackId: 7,
  handler: 'soun',
  sampleEntry: audioSampleEntry({
    type: 'mp4a',
    channelCount: 2,
    sampleRate: 48_000,
    configuration: encodeBox('esds', new Uint8Array(4)),
  }),
  timescale: 48_000,
  samples: [sampleOf()],
};

function movieOf(tracks: FixtureTrack[], layout: Partial<Mp4FileLayout> = {}): Mp4Box[] {
  const file = buildMp4File(tracks, { movieTimescale: 1000, ...layout });
  const [movie] = boxesIn(file.bytes.subarray(file.movieBox.offset, file.movieBox.end));
  return boxesIn(movie?.body ?? new Uint8Array());
}

function tracksOf(movie: readonly Mp4Box[]): TrackBoxes[] {
  return movie.filter((box) => box.type === 'trak').map((track) => trackBoxesOf(track));
}

describe('movieTimescaleOf', () => {
  it.each([0, 1] as const)(
    'reads the timescale edit lists count in, from a version %d header',
    (headerVersion) => {
      expect(movieTimescaleOf(movieOf([SOUND], { headerVersion }))).toBe(1000);
    },
  );
});

describe('trackHeadersOf', () => {
  it.each([0, 1] as const)('reads a video track from version %d headers', (headerVersion) => {
    const [track] = tracksOf(movieOf([lens(3, 'avc1', AVC_CONFIGURATION)], { headerVersion }));
    expect(track && trackHeadersOf(track)).toEqual({
      trackId: 3,
      handlerType: 'vide',
      mediaTimescale: 60_000,
      sampleEntryType: 'avc1',
      nalLengthSize: 4,
    });
  });

  it('reads the NAL length size of an HEVC track from its configuration', () => {
    const [track] = tracksOf(movieOf([lens(1, 'hvc1', HEVC_CONFIGURATION)]));
    expect(track && trackHeadersOf(track)).toMatchObject({
      sampleEntryType: 'hvc1',
      nalLengthSize: 2,
    });
  });

  it('reads a sound track, which has no NAL units', () => {
    const [track] = tracksOf(movieOf([SOUND]));
    expect(track && trackHeadersOf(track)).toEqual({
      trackId: 7,
      handlerType: 'soun',
      mediaTimescale: 48_000,
      sampleEntryType: 'mp4a',
      nalLengthSize: undefined,
    });
  });

  it('refuses a track without a media box', () => {
    const track = movieOf([SOUND]).find((box) => box.type === 'trak');
    const children = boxesIn(track?.body ?? new Uint8Array()).filter((box) => box.type !== 'mdia');
    const withoutMedia = encodeBox(
      'trak',
      Uint8Array.from(children.flatMap((box) => [...encodeBox(box.type, box.body)])),
    );
    const [trak] = boxesIn(withoutMedia);
    expect(captureError(() => trak && trackBoxesOf(trak))).toMatchObject({
      code: 'unsupported-container',
    });
  });
});
