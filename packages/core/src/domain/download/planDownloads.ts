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

/**
 * Where the picture stands, in time and in the file: its slowest reader, or where it last stood
 * once its readers closed.
 */
export interface PictureAnchor {
  readonly time: Seconds;
  readonly offset: number;
}

export interface DownloadState {
  readonly cursors: readonly CursorPosition[];
  readonly held: ByteRangeSet;
  readonly transfers: readonly TransferState[];
  /**
   * Whether playing has started: until then only what the picture waits for is read.
   */
  readonly isReadingAhead: boolean;
  /**
   * Where the picture stood at the last plan; none before a picture was ever read.
   */
  readonly anchor?: PictureAnchor | undefined;
  readonly policy: DownloadPolicy;
}

/**
 * What to do next: ranges to ask for, transfers to give up, held bytes to let go of, and where
 * the picture stands for the plans to come.
 */
export interface DownloadDecisions {
  readonly start: readonly ByteRange[];
  readonly cancel: readonly number[];
  readonly release: ByteRangeSet;
  readonly anchor: PictureAnchor | undefined;
}

/**
 * The download's plan, from where its cursors stand (ADR 0029). The window the picture reads in
 * starts where the picture stands: its slowest reader (at its track's end once it read it all),
 * or where it last stood once its readers closed, so the sound after the last frame still comes.
 * Once playing the window reaches as far ahead as the policy's seconds and bytes allow, before
 * that only to the frames the picture waits for; every picture reader's next frame is read,
 * however far from the others. Sound is read within the window, never beyond it, and not at all
 * before a picture was ever read. What the window wants and is neither held nor coming is asked
 * for, lowest first, when a cursor waits on it, a refill's worth is missing, or the window
 * reaches the tracks' end; what it no longer wants is given up or let go of, but for a stretch
 * kept behind the picture.
 */
export function planDownloads(state: DownloadState): DownloadDecisions {
  const pictures = state.cursors.filter((cursor) => cursor.track.kind === 'video');
  const anchor = pictures.length > 0 ? anchorOf(pictures) : state.anchor;
  if (!anchor) return nothingToRead(state);
  const windowEnd = seconds(anchor.time + (state.isReadingAhead ? state.policy.aheadSeconds : 0));
  const wanted = wantedBytes({ state, windowEnd, pictures }).bridgingGapsBelow(
    state.policy.bridgedGap,
  );
  const kept = state.transfers.filter((transfer) => wanted.overlaps(transfer.remaining));
  const coming = ByteRangeSet.of(kept.map((transfer) => transfer.remaining));
  const missing = wanted.subtract(state.held).subtract(coming);
  const room = state.policy.requestsInFlight - kept.length;
  const isDue = isTopUpDue({ state, pictures, windowEnd, missing });
  return {
    start: isDue ? requestsFor(missing, state.policy, room) : [],
    cancel: state.transfers
      .filter((transfer) => !kept.includes(transfer))
      .map((transfer) => transfer.id),
    release: state.held.subtract(wanted.union(keptBehind(anchor, state.policy))),
    anchor,
  };
}

function nothingToRead(state: DownloadState): DownloadDecisions {
  const cancel = state.transfers.map((transfer) => transfer.id);
  return { start: [], cancel, release: ByteRangeSet.empty, anchor: undefined };
}

function anchorOf(pictures: readonly CursorPosition[]): PictureAnchor {
  return {
    time: seconds(Math.min(...pictures.map((cursor) => timeOf(cursor)))),
    offset: Math.min(...pictures.map((cursor) => offsetOf(cursor))),
  };
}

interface Window {
  readonly state: DownloadState;
  readonly windowEnd: Seconds;
  readonly pictures: readonly CursorPosition[];
}

/**
 * Every sample a cursor will hand out within the window, clipped to the bytes the policy allows
 * ahead, nearest first; and every picture reader's next frame, whatever the window and the
 * budget, so no picture waits for ever, however far from the others it reads.
 */
function wantedBytes(window: Window): ByteRangeSet {
  const { state, windowEnd, pictures } = window;
  const needs = state.cursors.flatMap((cursor) => needsOf(cursor, windowEnd));
  const reading = pictures.filter((cursor) => !isAtItsEnd(cursor));
  const nextFrames = ByteRangeSet.of(reading.map((cursor) => cursor.track.rangeOf(cursor.sample)));
  return withinBytes(ByteRangeSet.of(needs), state.policy.aheadBytes).union(nextFrames);
}

function needsOf(cursor: CursorPosition, windowEnd: Seconds): ByteRange[] {
  const { track } = cursor;
  const needs: ByteRange[] = [];
  for (let sample = cursor.sample; sample < track.sampleCount; sample += 1) {
    if (track.timestampOf(sample) > windowEnd) break;
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

interface TopUp extends Window {
  readonly missing: ByteRangeSet;
}

function isTopUpDue(topUp: TopUp): boolean {
  const { state, pictures, windowEnd, missing } = topUp;
  if (missing.isEmpty) return false;
  const isStarving = state.cursors.some(
    (cursor) =>
      cursor.isWaiting &&
      !isAtItsEnd(cursor) &&
      missing.overlaps(cursor.track.rangeOf(cursor.sample)),
  );
  const isAtTheEnd = pictures.every(
    (cursor) => cursor.track.end <= windowEnd + lastDurationOf(cursor.track),
  );
  return isStarving || isAtTheEnd || missing.totalLength >= state.policy.refillBytes;
}

function lastDurationOf(track: TrackSampleTable): number {
  return track.sampleCount > 0 ? track.durationOf(track.sampleCount - 1) : 0;
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
 * The stretch behind the picture that is kept for short seeks back.
 */
function keptBehind(anchor: PictureAnchor, policy: DownloadPolicy): ByteRangeSet {
  const start = Math.max(0, anchor.offset - policy.keepBehindBytes);
  return ByteRangeSet.of([ByteRange.of(start, anchor.offset - start)]);
}

function isAtItsEnd(cursor: CursorPosition): boolean {
  return cursor.sample >= cursor.track.sampleCount;
}

/**
 * When a picture reader stands: at its next frame, or at its track's end once it read them all.
 */
function timeOf(cursor: CursorPosition): Seconds {
  return isAtItsEnd(cursor) ? cursor.track.end : cursor.track.timestampOf(cursor.sample);
}

function offsetOf(cursor: CursorPosition): number {
  const { track } = cursor;
  if (!isAtItsEnd(cursor)) return track.rangeOf(cursor.sample).offset;
  return track.sampleCount > 0 ? track.rangeOf(track.sampleCount - 1).end : 0;
}
