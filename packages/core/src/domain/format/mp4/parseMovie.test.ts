import { beforeAll, describe, expect, it } from 'vitest';

import { boxesIn } from './movieBoxes';
import { parseMovie } from './parseMovie';
import type { SampleTable } from '../../container/SampleTable';
import { seconds } from '../../../shared/units/time';
import { encodeBox } from '../../../testing/encodeBox';
import {
  buildMp4File,
  type BuiltMp4File,
  type FixtureTrack,
} from '../../../testing/mp4/buildMp4File';
import { concatenated } from '../../../shared/binary/concatenated';
import { audioSampleEntry, videoSampleEntry } from '../../../testing/mp4/sampleEntries';
import { captureError } from '../../../../test/support/errors';

const HEVC_CONFIGURATION = encodeBox(
  'hvcC',
  Uint8Array.from({ length: 23 }, (_, index) => (index === 21 ? 0x03 : 0)),
);
/**
 * A four-byte length, then an HEVC NAL header of the given type and a payload byte.
 */
const hevcSample = (type: number): Uint8Array => Uint8Array.of(0, 0, 0, 3, type << 1, 1, 0xaa);

function lens(trackId: number): FixtureTrack {
  return {
    trackId,
    handler: 'vide',
    sampleEntry: videoSampleEntry({
      type: 'hvc1',
      width: 64,
      height: 64,
      configuration: HEVC_CONFIGURATION,
    }),
    timescale: 60_000,
    samples: Array.from({ length: 6 }, (_, index) => ({
      bytes: hevcSample(index % 3 === 0 ? 19 : 1),
      duration: 1001,
      isSync: index % 3 === 0,
    })),
  };
}

const SOUND: FixtureTrack = {
  trackId: 2,
  handler: 'soun',
  sampleEntry: audioSampleEntry({
    type: 'mp4a',
    channelCount: 2,
    sampleRate: 48_000,
    configuration: encodeBox('esds', new Uint8Array(4)),
  }),
  timescale: 48_000,
  samples: Array.from({ length: 4 }, () => ({
    bytes: new Uint8Array(9),
    duration: 1024,
    isSync: true,
  })),
  syncSamples: 'unlisted',
};

const TIMECODE: FixtureTrack = {
  ...SOUND,
  trackId: 4,
  handler: 'tmcd',
  sampleEntry: encodeBox('tmcd', new Uint8Array(8)),
};

function movieBoxOf(file: BuiltMp4File): Uint8Array {
  return file.bytes.subarray(file.movieBox.offset, file.movieBox.end);
}

/**
 * A copy of the movie box whose first sync sample table lists `numbers` in place of its own;
 * as many as it had.
 */
function withSyncSamples(movieBox: Uint8Array, numbers: readonly number[]): Uint8Array {
  const patched = Uint8Array.from(movieBox);
  const type = new TextDecoder().decode(patched).indexOf('stss');
  const view = new DataView(patched.buffer);
  const entries = type + STSS_ENTRIES_AFTER_TYPE;
  for (const [index, number] of numbers.entries()) view.setUint32(entries + 4 * index, number);
  return patched;
}

/**
 * The box type, then its version and flags and its entry count, before the entries.
 */
const STSS_ENTRIES_AFTER_TYPE = 12;

describe('parseMovie', () => {
  const tracks = [lens(1), SOUND, lens(3)];
  let file: BuiltMp4File;
  let table: SampleTable;

  beforeAll(() => {
    file = buildMp4File(tracks, { movieTimescale: 1000 });
    table = parseMovie(movieBoxOf(file));
  });

  it('reads every track of picture or sound, in the order of the movie box', () => {
    expect(table.tracks.map((track) => [track.trackId, track.kind])).toEqual([
      [1, 'video'],
      [2, 'audio'],
      [3, 'video'],
    ]);
  });

  it('places every sample where the file holds it', () => {
    for (const [index, fixture] of tracks.entries()) {
      const track = table.tracks[index];
      const ranges = fixture.samples.map((_, sample) => track?.rangeOf(sample));
      expect(ranges.map((range) => range?.offset)).toEqual(file.sampleOffsets[index]);
      expect(ranges.map((range) => range?.length)).toEqual(
        fixture.samples.map((sample) => sample.bytes.byteLength),
      );
    }
  });

  it('times the samples and marks where decoding may start', () => {
    const [first] = table.videoTracks;
    expect(first?.timestampOf(2)).toBe((2 * 1001) / 60_000);
    expect([0, 1, 2, 3].map((sample) => first?.isSync(sample))).toEqual([true, false, false, true]);
    expect(table.duration).toBe(seconds((6 * 1001) / 60_000));
  });

  it('takes every sound sample for a sync sample when the track lists none', () => {
    const [sound] = table.audioTracks;
    expect([0, 1, 2, 3].map((sample) => sound?.isSync(sample))).toEqual([true, true, true, true]);
  });

  it('checks a video keyframe by its own NAL units', () => {
    const [first] = table.videoTracks;
    expect(first?.keyframeRule.isKeyframe(hevcSample(19))).toBe(true);
    expect(first?.keyframeRule.isKeyframe(hevcSample(1))).toBe(false);
  });

  it('leaves out a track that is neither picture nor sound', () => {
    const withTimecodeFile = buildMp4File([lens(1), TIMECODE]);
    const withTimecode = parseMovie(movieBoxOf(withTimecodeFile));
    expect(withTimecode.tracks.map((track) => track.trackId)).toEqual([1]);
  });

  it('leaves out a track that is neither picture nor sound however malformed its sample table', () => {
    const malformedTimecode = { ...TIMECODE, sampleEntry: new Uint8Array() };
    const file = buildMp4File([lens(1), malformedTimecode]);
    const withTimecode = parseMovie(movieBoxOf(file));
    expect(withTimecode.tracks.map((track) => track.trackId)).toEqual([1]);
  });

  it.each([
    ['sample 0, which does not exist', [0, 4]],
    ['a sample twice', [1, 1]],
    ['a sample past the last', [1, 7]],
  ])("refuses a sync sample table listing %s as the file's damage", (_, numbers) => {
    const file = buildMp4File([lens(1)]);
    const movieBox = withSyncSamples(movieBoxOf(file), numbers);
    expect(captureError(() => parseMovie(movieBox))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('sync sample') as string,
    });
  });

  it('refuses a track whose times count in a timescale of zero', () => {
    const file = buildMp4File([{ ...lens(1), timescale: 0 }]);
    expect(captureError(() => parseMovie(movieBoxOf(file)))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('timescale of 0') as string,
    });
  });

  it('refuses a fragmented movie, whose samples are described outside the movie box', () => {
    const [movie] = boxesIn(movieBoxOf(file));
    const movieExtends = encodeBox('mvex', new Uint8Array(8));
    const fragmented = encodeBox(
      'moov',
      concatenated([movie?.body ?? new Uint8Array(), movieExtends]),
    );
    expect(captureError(() => parseMovie(fragmented))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('fragment') as string,
    });
  });

  it('refuses bytes that are not a movie box', () => {
    expect(captureError(() => parseMovie(encodeBox('free', new Uint8Array(4))))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('not where the file says') as string,
    });
  });
});
