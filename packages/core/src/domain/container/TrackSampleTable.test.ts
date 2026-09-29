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
    expect(table.firstSyncSample()).toBe(1);
  });

  it('has no first sync sample when it lists none', () => {
    expect(new TrackSampleTable(partsOf({ syncSamples: [] })).firstSyncSample()).toBeUndefined();
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
    expect(failure).toMatchObject({ code: 'invariant-violation' });
  });

  it('refuses a sync sample that is not one of its samples', () => {
    const failure = captureError(() => new TrackSampleTable(partsOf({ syncSamples: [6] })));
    expect(failure).toMatchObject({ code: 'invariant-violation' });
  });
});
