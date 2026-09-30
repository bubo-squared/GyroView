import type { DownloadPolicy } from './DownloadPolicy';
import type { TrackSampleTable } from '../container/TrackSampleTable';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { seconds, type Seconds } from '../../shared/units/time';

/**
 * Where one reader of a track stands: the next sample it hands out, and whether it waits for it.
 */
export interface CursorPosition {
  readonly track: TrackSampleTable;
  readonly sample: number;
  readonly isWaiting: boolean;
}

/**
 * A range asked for and still coming: what of it has not arrived.
 */
export interface TransferState {
  readonly id: number;
  readonly remaining: ByteRange;
}

export interface DownloadState {
  readonly cursors: readonly CursorPosition[];
  readonly held: ByteRangeSet;
  readonly transfers: readonly TransferState[];
  /**
   * Whether playing has started: until then only what the picture waits for is read.
   */
  readonly isReadingAhead: boolean;
  readonly policy: DownloadPolicy;
}

/**
 * What to do next: ranges to ask for, transfers to give up, held bytes to let go of.
 */
export interface DownloadDecisions {
  readonly start: readonly ByteRange[];
  readonly cancel: readonly number[];
  readonly release: ByteRangeSet;
}

/**
 * The download's plan, from where its cursors stand (ADR 0029). The window the picture reads in
 * starts at its slowest cursor; once playing it reaches as far ahead as the policy's seconds and
 * bytes allow, before that only to the frames the picture waits for. Sound is read within the
 * picture's window, never beyond it. What the window wants and is neither held nor coming is
 * asked for, lowest first, when a cursor waits on it, a refill's worth is missing, or the window
 * reaches the tracks' end; what it no longer wants is given up or let go of, but for a stretch
 * kept behind the picture.
 */
export function planDownloads(state: DownloadState): DownloadDecisions {
  const pictures = state.cursors.filter(
    (cursor) => cursor.track.kind === 'video' && cursor.sample < cursor.track.sampleCount,
  );
  if (pictures.length === 0) {
    return {
      start: [],
      cancel: state.transfers.map((transfer) => transfer.id),
      release: ByteRangeSet.empty,
    };
  }
  const windowEnd = windowEndOf(pictures, state);
  const wanted = wantedBytes(state, windowEnd).bridgingGapsBelow(state.policy.bridgedGap);
  const kept = state.transfers.filter((transfer) => wanted.overlaps(transfer.remaining));
  const coming = ByteRangeSet.of(kept.map((transfer) => transfer.remaining));
  const missing = wanted.subtract(state.held).subtract(coming);
  const isDue = isTopUpDue({ state, pictures, windowEnd, missing });
  return {
    start: isDue
      ? requestsFor(missing, state.policy, state.policy.requestsInFlight - kept.length)
      : [],
    cancel: state.transfers
      .filter((transfer) => !kept.includes(transfer))
      .map((transfer) => transfer.id),
    release: state.held.subtract(wanted.union(keptBehind(pictures, state.policy))),
  };
}

function windowEndOf(pictures: readonly CursorPosition[], state: DownloadState): Seconds {
  const times = pictures.map((cursor) => cursor.track.timestampOf(cursor.sample));
  return seconds(
    state.isReadingAhead ? Math.min(...times) + state.policy.aheadSeconds : Math.max(...times),
  );
}

/**
 * Every sample a cursor will hand out within the window, a picture's next one always, clipped to
 * the bytes the policy allows ahead, nearest first.
 */
function wantedBytes(state: DownloadState, windowEnd: Seconds): ByteRangeSet {
  const needs = state.cursors.flatMap((cursor) => needsOf(cursor, windowEnd));
  return withinBytes(ByteRangeSet.of(needs), state.policy.aheadBytes);
}

function needsOf(cursor: CursorPosition, windowEnd: Seconds): ByteRange[] {
  const { track } = cursor;
  const needs: ByteRange[] = [];
  const isPicture = track.kind === 'video';
  for (let sample = cursor.sample; sample < track.sampleCount; sample += 1) {
    const isNext = sample === cursor.sample;
    if (track.timestampOf(sample) > windowEnd && !(isPicture && isNext)) break;
    needs.push(track.rangeOf(sample));
  }
  return needs;
}

function withinBytes(wanted: ByteRangeSet, budget: number): ByteRangeSet {
  const kept: ByteRange[] = [];
  let left = budget;
  for (const range of wanted.ranges) {
    if (left <= 0) break;
    kept.push(ByteRange.of(range.offset, Math.min(range.length, left)));
    left -= range.length;
  }
  return ByteRangeSet.of(kept);
}

interface TopUp {
  readonly state: DownloadState;
  readonly pictures: readonly CursorPosition[];
  readonly windowEnd: Seconds;
  readonly missing: ByteRangeSet;
}

function isTopUpDue(topUp: TopUp): boolean {
  const { state, pictures, windowEnd, missing } = topUp;
  if (missing.isEmpty) return false;
  const isStarving = state.cursors.some(
    (cursor) =>
      cursor.isWaiting &&
      cursor.sample < cursor.track.sampleCount &&
      missing.overlaps(cursor.track.rangeOf(cursor.sample)),
  );
  const isAtTheEnd = pictures.every(
    (cursor) => cursor.track.end <= windowEnd + lastDurationOf(cursor.track),
  );
  return isStarving || isAtTheEnd || missing.totalLength >= state.policy.refillBytes;
}

function lastDurationOf(track: TrackSampleTable): number {
  return track.durationOf(track.sampleCount - 1);
}

/**
 * The missing ranges in order, cut to the request size, as many as there is room for.
 */
function requestsFor(missing: ByteRangeSet, policy: DownloadPolicy, room: number): ByteRange[] {
  const requests: ByteRange[] = [];
  for (const range of missing.ranges) {
    for (
      let offset = range.offset;
      offset < range.end && requests.length < room;
      offset += policy.requestSize
    ) {
      requests.push(ByteRange.of(offset, Math.min(policy.requestSize, range.end - offset)));
    }
  }
  return requests;
}

/**
 * The stretch behind the slowest picture that is kept for short seeks back.
 */
function keptBehind(pictures: readonly CursorPosition[], policy: DownloadPolicy): ByteRangeSet {
  const offsets = pictures.map((cursor) => cursor.track.rangeOf(cursor.sample).offset);
  const pictureOffset = Math.min(...offsets);
  const start = Math.max(0, pictureOffset - policy.keepBehindBytes);
  return ByteRangeSet.of([ByteRange.of(start, pictureOffset - start)]);
}
