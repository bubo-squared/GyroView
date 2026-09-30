import { describe, expect, it } from 'vitest';

import { EVERY_SAMPLE_IS_A_KEYFRAME } from './KeyframeRule';
import { TrackSampleTable, type TrackSampleTableParts } from './TrackSampleTable';
import { seconds } from '../../shared/units/time';
import { captureError } from '../../../test/support/errors';

/**
 * Six video samples, 100 bytes apart and 0.1 s long, sync at the first and the fourth.
 */
function partsOf(overrides: Partial<TrackSampleTableParts> = {}): TrackSampleTableParts {
  return {
    trackId: 1,
    kind: 'video',
    offsets: Float64Array.of(1000, 1100, 1200, 1300, 1400, 1500),
    sizes: Float64Array.of(90, 80, 70, 95, 60, 50),
    timestamps: Float64Array.of(0, 0.1, 0.2, 0.3, 0.4, 0.5),
    durations: Float64Array.of(0.1, 0.1, 0.1, 0.1, 0.1, 0.1),
    syncSamples: [0, 3],
    end: seconds(0.6),
    keyframeRule: EVERY_SAMPLE_IS_A_KEYFRAME,
    ...overrides,
  };
}

describe('TrackSampleTable', () => {
  it('tells where each sample lies, when it shows, for how long and whether decoding may start there', () => {
    const table = new TrackSampleTable(partsOf());
    expect(table.sampleCount).toBe(6);
    expect(table.rangeOf(3)).toMatchObject({ offset: 1300, length: 95 });
    expect(table.timestampOf(3)).toBe(0.3);
    expect(table.durationOf(3)).toBe(0.1);
    expect([0, 1, 2, 3, 4, 5].map((sample) => table.isSync(sample))).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(table.end).toBe(0.6);
  });

  it('takes every sample for a sync sample when the track lists none', () => {
    const table = new TrackSampleTable(partsOf({ syncSamples: undefined }));
    expect([0, 1, 2].map((sample) => table.isSync(sample))).toEqual([true, true, true]);
    expect(table.keyframeAt(seconds(0.25))).toBe(2);
    expect(table.syncSampleAtOrBefore(0)).toBe(0);
    expect(table.syncSampleAtOrBefore(-1)).toBeUndefined();
  });

  it('finds the sample showing at a time, and none before the first', () => {
    const table = new TrackSampleTable(partsOf());
    expect(table.sampleShownAt(seconds(-0.01))).toBeUndefined();
    expect(table.sampleShownAt(seconds(0))).toBe(0);
    expect(table.sampleShownAt(seconds(0.25))).toBe(2);
    expect(table.sampleShownAt(seconds(9))).toBe(5);
  });

  it('finds the key frame a time decodes from: the sync sample at or before the one showing', () => {
    const table = new TrackSampleTable(partsOf());
    expect(table.keyframeAt(seconds(0.29))).toBe(0);
    expect(table.keyframeAt(seconds(0.3))).toBe(3);
    expect(table.keyframeAt(seconds(9))).toBe(3);
    expect(table.keyframeAt(seconds(-0.01))).toBeUndefined();
  });

  it('finds the sync sample at or before a sample, and the first one', () => {
    const table = new TrackSampleTable(partsOf({ syncSamples: [1, 4] }));
    expect(table.syncSampleAtOrBefore(3)).toBe(1);
    expect(table.syncSampleAtOrBefore(4)).toBe(4);
    expect(table.syncSampleAtOrBefore(0)).toBeUndefined();
  });

  it('finds the sync sample at or after a sample, and none past the last', () => {
    const table = new TrackSampleTable(partsOf({ syncSamples: [1, 4] }));
    expect([0, 1, 2, 4].map((sample) => table.syncSampleAtOrAfter(sample))).toEqual([1, 1, 4, 4]);
    expect(table.syncSampleAtOrAfter(5)).toBeUndefined();
  });

  it('has no sync sample at all when it lists none', () => {
    const table = new TrackSampleTable(partsOf({ syncSamples: [] }));
    expect(table.syncSampleAtOrAfter(0)).toBeUndefined();
  });

  it('orders by presentation where frames show in another order than they decode', () => {
    const table = new TrackSampleTable(
      partsOf({ timestamps: Float64Array.of(0, 0.2, 0.1, 0.3, 0.5, 0.4) }),
    );
    expect(table.sampleShownAt(seconds(0.15))).toBe(2);
    expect(table.sampleShownAt(seconds(0.45))).toBe(5);
    expect(table.timestampsInPresentationOrder()).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('refuses columns that disagree on the sample count', () => {
    const failure = captureError(
      () => new TrackSampleTable(partsOf({ sizes: Float64Array.of(1) })),
    );
    expect(failure).toMatchObject({
      code: 'invariant-violation',
      message: expect.stringContaining('track 1 disagrees') as string,
    });
  });

  it.each([
    ['past its samples', [6]],
    ['before its first sample', [-1]],
    ['between two samples', [1.5]],
    ['out of order', [3, 1]],
    ['twice', [3, 3]],
  ])('refuses a sync sample %s', (_, syncSamples) => {
    const failure = captureError(() => new TrackSampleTable(partsOf({ syncSamples })));
    expect(failure).toMatchObject({
      code: 'invariant-violation',
      message: expect.stringContaining('sync samples of track 1') as string,
    });
  });

  it('refuses to tell of a sample it does not have', () => {
    const table = new TrackSampleTable(partsOf());
    for (const ask of [
      (): unknown => table.rangeOf(6),
      (): unknown => table.timestampOf(-1),
      (): unknown => table.durationOf(6),
      (): unknown => table.isSync(6),
    ]) {
      expect(captureError(ask)).toMatchObject({
        code: 'index-out-of-range',
        message: expect.stringContaining('sample of track 1') as string,
      });
    }
  });

  it('starts decoding at the first sample of a track that lists no sync samples, and nowhere in an empty one', () => {
    const listing = new TrackSampleTable(partsOf({ syncSamples: undefined }));
    expect([0, 3].map((sample) => listing.syncSampleAtOrAfter(sample))).toEqual([0, 3]);
    expect(listing.syncSampleAtOrAfter(listing.sampleCount)).toBeUndefined();
    const empty = new TrackSampleTable(
      partsOf({
        offsets: new Float64Array(),
        sizes: new Float64Array(),
        timestamps: new Float64Array(),
        durations: new Float64Array(),
        syncSamples: undefined,
      }),
    );
    expect(empty.syncSampleAtOrAfter(0)).toBeUndefined();
    expect(empty.keyframeAt(seconds(1))).toBeUndefined();
  });
});
