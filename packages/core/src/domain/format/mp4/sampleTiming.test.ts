import { describe, expect, it } from 'vitest';

import { boxesIn } from './movieBoxes';
import { sampleTimingOf } from './sampleTiming';
import { trackBoxesOf } from './trackHeaders';
import { encodeBox } from '../../../testing/encodeBox';
import {
  buildMp4File,
  type FixtureEdit,
  type FixtureTrack,
} from '../../../testing/mp4/buildMp4File';
import { videoSampleEntry } from '../../../testing/mp4/sampleEntries';
import { captureError } from '../../../../test/support/errors';

const TIMESCALE = 10_240;
const DELTA = 1024;
const MOVIE_TIMESCALE = 1000;

function track(overrides: Partial<FixtureTrack> = {}): FixtureTrack {
  return {
    trackId: 1,
    handler: 'vide',
    sampleEntry: videoSampleEntry({
      type: 'avc1',
      width: 64,
      height: 64,
      configuration: encodeBox('avcC', new Uint8Array(5)),
    }),
    timescale: TIMESCALE,
    samples: Array.from({ length: 6 }, () => ({
      bytes: new Uint8Array(3),
      duration: DELTA,
      isSync: true,
    })),
    ...overrides,
  };
}

function withOffsets(offsets: readonly number[], version: 'version-0' | 'version-1'): FixtureTrack {
  const plain = track();
  return track({
    compositionOffsets: version,
    samples: plain.samples.map((sample, index) => ({
      ...sample,
      compositionOffset: offsets[index] ?? 0,
    })),
  });
}

function timingOf(fixture: FixtureTrack): ReturnType<typeof sampleTimingOf> {
  const file = buildMp4File([fixture], { movieTimescale: MOVIE_TIMESCALE });
  const [movie] = boxesIn(file.bytes.subarray(file.movieBox.offset, file.movieBox.end));
  const trak = boxesIn(movie?.body ?? new Uint8Array()).find((box) => box.type === 'trak');
  if (!trak) throw new Error('no track');
  return sampleTimingOf(trackBoxesOf(trak), {
    media: TIMESCALE,
    movie: MOVIE_TIMESCALE,
    sampleCount: fixture.samples.length,
  });
}

function withEdits(edits: readonly FixtureEdit[]): ReturnType<typeof sampleTimingOf> {
  return timingOf(track({ edits }));
}

describe('sampleTimingOf', () => {
  it('shows each sample when it decodes, for its decode duration, when nothing shifts it', () => {
    const timing = timingOf(track());
    expect([...timing.timestamps]).toEqual(
      [0, 1, 2, 3, 4, 5].map((index) => (index * DELTA) / TIMESCALE),
    );
    expect([...timing.durations]).toEqual(Array.from({ length: 6 }, () => DELTA / TIMESCALE));
    expect(timing.end).toBe((6 * DELTA) / TIMESCALE);
  });

  it('shows each sample its composition offset after it decodes, as the cameras write HEVC', () => {
    const timing = timingOf(withOffsets([DELTA, DELTA, DELTA, DELTA, DELTA, DELTA], 'version-0'));
    expect(timing.timestamps[0]).toBe(DELTA / TIMESCALE);
    expect(timing.durations[0]).toBe(DELTA / TIMESCALE);
    expect(timing.end).toBe((7 * DELTA) / TIMESCALE);
  });

  it('lasts each reordered frame until the next one shows, the last one shown for its own decode duration', () => {
    const timing = timingOf(
      withOffsets([DELTA, -DELTA / 2, DELTA, -DELTA / 2, DELTA, -DELTA / 2], 'version-1'),
    );
    const shown = [1, 0.5, 3, 2.5, 5, 4.5].map((ticks) => (ticks * DELTA) / TIMESCALE);
    expect([...timing.timestamps]).toEqual(shown);
    const gaps = [1.5, 0.5, 1.5, 0.5, 1, 0.5].map((ticks) => (ticks * DELTA) / TIMESCALE);
    expect([...timing.durations]).toEqual(gaps);
    expect(timing.end).toBe((6 * DELTA) / TIMESCALE);
  });

  it('starts the media later by an empty edit, converted to the track timescale and rounded', () => {
    const timing = withEdits([
      { segmentDuration: 333, mediaTime: -1 },
      { segmentDuration: 600, mediaTime: 0 },
    ]);
    const emptyTicks = Math.round((333 / MOVIE_TIMESCALE) * TIMESCALE);
    expect(timing.timestamps[0]).toBe(emptyTicks / TIMESCALE);
    expect(timing.timestamps[1]).toBe((emptyTicks + DELTA) / TIMESCALE);
  });

  it('shows the media from the edit media time on, in ticks divided once', () => {
    const timing = withEdits([{ segmentDuration: 400, mediaTime: 2 * DELTA }]);
    expect(timing.timestamps[0]).toBe((-2 * DELTA) / TIMESCALE);
    expect(timing.timestamps[3]).toBe(DELTA / TIMESCALE);
  });

  it('follows only the first edit that shows media, as mediabunny does', () => {
    const timing = withEdits([
      { segmentDuration: 300, mediaTime: DELTA },
      { segmentDuration: 300, mediaTime: 4 * DELTA },
    ]);
    expect(timing.timestamps[1]).toBe(0);
  });

  it('refuses a time-to-sample table that counts other samples than the sizes do', () => {
    const file = buildMp4File([track()], { movieTimescale: MOVIE_TIMESCALE });
    const [movie] = boxesIn(file.bytes.subarray(file.movieBox.offset, file.movieBox.end));
    const trak = boxesIn(movie?.body ?? new Uint8Array()).find((box) => box.type === 'trak');
    if (!trak) throw new Error('no track');
    const timescales = { media: TIMESCALE, movie: MOVIE_TIMESCALE, sampleCount: 7 };
    expect(captureError(() => sampleTimingOf(trackBoxesOf(trak), timescales))).toMatchObject({
      code: 'unsupported-container',
    });
  });
});
