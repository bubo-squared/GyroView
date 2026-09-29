import { describe, expect, it } from 'vitest';

import { EVERY_SAMPLE_IS_A_KEYFRAME } from './KeyframeRule';
import { SampleTable } from './SampleTable';
import { TrackSampleTable, type TrackKind } from './TrackSampleTable';
import { seconds } from '../../shared/units/time';

function trackOf(trackId: number, kind: TrackKind, end: number): TrackSampleTable {
  return new TrackSampleTable({
    trackId,
    kind,
    offsets: Float64Array.of(0),
    sizes: Float64Array.of(1),
    timestamps: Float64Array.of(0),
    durations: Float64Array.of(end),
    syncSamples: undefined,
    end: seconds(end),
    keyframeRule: EVERY_SAMPLE_IS_A_KEYFRAME,
  });
}

describe('SampleTable', () => {
  const lens0 = trackOf(1, 'video', 262.09);
  const sound = trackOf(2, 'audio', 262.04);
  const lens1 = trackOf(3, 'video', 262.1);
  const table = new SampleTable([lens0, sound, lens1]);

  it('sorts its tracks into picture and sound, in the file order', () => {
    expect(table.videoTracks).toEqual([lens0, lens1]);
    expect(table.audioTracks).toEqual([sound]);
  });

  it('finds a track by its id', () => {
    expect(table.trackWithId(3)).toBe(lens1);
    expect(table.trackWithId(9)).toBeUndefined();
  });

  it('lasts as long as its longest track', () => {
    expect(table.duration).toBe(262.1);
    expect(new SampleTable([]).duration).toBe(0);
  });
});
