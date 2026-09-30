import type { TrackSampleTable } from '../container/TrackSampleTable';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import type { Seconds } from '../../shared/units/time';

/**
 * Where one reader of a track stands: the next sample it hands out, and whether it waits for it.
 */
export interface CursorPosition {
  readonly track: TrackSampleTable;
  readonly sample: number;
  readonly isWaiting: boolean;
  /**
   * The time the reader reads toward at once, as decoding for a seek reads from the key frame
   * before it; every sample up to it is wanted, even before playing.
   */
  readonly target?: Seconds | undefined;
}

/**
 * The ranges of the samples a cursor will hand out, in decode order, up to the first that shows
 * after `until`: with B-frames the window ends up to a reordering group early, which the plans
 * after read.
 */
export function needsOf(cursor: CursorPosition, until: Seconds): ByteRange[] {
  const { track } = cursor;
  const needs: ByteRange[] = [];
  for (let sample = cursor.sample; sample < track.sampleCount; sample += 1) {
    if (track.timestampOf(sample) > until) break;
    needs.push(track.rangeOf(sample));
  }
  return needs;
}

/**
 * The first `budget` bytes of `wanted`, lowest first; the gaps between its ranges cost nothing.
 */
export function withinBytes(wanted: ByteRangeSet, budget: number): ByteRangeSet {
  const kept: ByteRange[] = [];
  let left = budget;
  for (const range of wanted.ranges) {
    if (left <= 0) break;
    kept.push(ByteRange.of(range.offset, Math.min(range.length, left)));
    left -= range.length;
  }
  return ByteRangeSet.of(kept);
}
