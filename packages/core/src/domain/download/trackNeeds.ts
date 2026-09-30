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
}

/**
 * The ranges of every sample a cursor will hand out up to `until`, in decode order.
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
