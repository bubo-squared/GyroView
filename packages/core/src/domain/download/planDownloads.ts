import type { DownloadPolicy } from './DownloadPolicy';
import { resumeThresholdOf } from './isReadyToResume';
import { needsOf, withinBytes, type CursorPosition } from './trackNeeds';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { seconds, type Seconds } from '../../shared/units/time';

export type { CursorPosition } from './trackNeeds';

/**
 * A range asked for and still coming: what of it has not arrived.
 */
export interface TransferState {
  readonly id: number;
  readonly remaining: ByteRange;
}

/**
 * Where the window starts, in time and in the file: at the slowest picture reader, where the
 * picture last stood once its readers closed, or at the sound where no picture was ever read.
 */
export interface WindowAnchor {
  readonly time: Seconds;
  readonly offset: number;
}

export interface DownloadState {
  readonly cursors: readonly CursorPosition[];
  readonly held: ByteRangeSet;
  readonly transfers: readonly TransferState[];
  /**
   * Ranges that failed, not to be asked for again.
   */
  readonly unreadable: ByteRangeSet;
  /**
   * Whether playing has started: until then only what the picture waits for is read.
   */
  readonly isReadingAhead: boolean;
  /**
   * Where the picture stood at the last plan; none before a picture was ever read.
   */
  readonly anchor?: WindowAnchor | undefined;
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
  readonly anchor: WindowAnchor | undefined;
}

/**
 * The download's plan, from where its cursors stand (ADR 0029). The window the picture reads in
 * starts where the picture stands: its slowest reader (at its track's end once it read it all),
 * or where it last stood once its readers closed, so the sound after the last frame still comes.
 * Once playing the window reaches as far ahead as the policy's seconds and bytes allow, before
 * that only to the frames the picture waits for; every picture reader's next frame is read,
 * however far from the others. What readers want is read to the window's end; a reader standing
 * before the stretch kept behind the picture, as the sound is until it follows a seek, wants
 * nothing; sound is read not at all before a picture was ever read but once playing. What the window wants and is neither held,
 * coming nor failed is asked for, lowest first, when a cursor waits on it, a refill's worth is
 * missing, or the window reaches the tracks' end; what it no longer wants is given up or let go
 * of, but for a stretch kept behind the picture.
 */
export function planDownloads(state: DownloadState): DownloadDecisions {
  const pictures = state.cursors.filter((cursor) => cursor.track.kind === 'video');
  const anchor = pictures.length > 0 ? anchorOf(pictures) : state.anchor;
  const windowStart = anchor ?? soundLeadOf(state);
  if (!windowStart) return nothingToRead(state);
  const ahead = state.isReadingAhead ? state.policy.aheadSeconds : 0;
  const windowEnd = seconds(windowStart.time + ahead);
  const wanted = wantedBytes({ state, windowStart, windowEnd, pictures }).bridgingGapsBelow(
    state.policy.bridgedGap,
  );
  const kept = state.transfers.filter((transfer) => wanted.overlaps(transfer.remaining));
  const coming = ByteRangeSet.of(kept.map((transfer) => transfer.remaining));
  const missing = wanted.subtract(state.held).subtract(coming).subtract(state.unreadable);
  const room = state.policy.requestsInFlight - kept.length;
  const threshold = thresholdOf(state, windowStart);
  const isDue = isTopUpDue({ state, windowEnd, missing, threshold });
  return {
    start: isDue ? requestsFor(missing, state.policy, room) : [],
    cancel: state.transfers
      .filter((transfer) => !kept.includes(transfer))
      .map((transfer) => transfer.id),
    release: state.held.subtract(wanted.union(keptBehind(windowStart, state.policy))),
    anchor,
  };
}

/**
 * Where the window starts once playing where no picture was ever read: at the sound, which then
 * has no picture to follow, and follows it as it moves on.
 */
function soundLeadOf(state: DownloadState): WindowAnchor | undefined {
  return state.isReadingAhead && state.cursors.length > 0 ? anchorOf(state.cursors) : undefined;
}

function nothingToRead(state: DownloadState): DownloadDecisions {
  const cancel = state.transfers.map((transfer) => transfer.id);
  return { start: [], cancel, release: ByteRangeSet.empty, anchor: undefined };
}

function anchorOf(cursors: readonly CursorPosition[]): WindowAnchor {
  return {
    time: seconds(Math.min(...cursors.map((cursor) => timeOf(cursor)))),
    offset: Math.min(...cursors.map((cursor) => offsetOf(cursor))),
  };
}

interface Window {
  readonly state: DownloadState;
  readonly windowStart: WindowAnchor;
  readonly windowEnd: Seconds;
  readonly pictures: readonly CursorPosition[];
}

/**
 * Every sample a cursor will hand out within the window, clipped to the bytes the policy allows
 * ahead, nearest first; and every picture reader's next frame, whatever the window and the
 * budget, so no picture waits for ever, however far from the others it reads.
 */
function wantedBytes(window: Window): ByteRangeSet {
  const { state, windowStart, windowEnd, pictures } = window;
  const floor = keptBehindStart(windowStart, state.policy);
  const needs = state.cursors
    .filter((cursor) => offsetOf(cursor) >= floor)
    .flatMap((cursor) => needsOf(cursor, windowEnd));
  const reading = pictures.filter((cursor) => !isAtItsEnd(cursor));
  const nextFrames = ByteRangeSet.of(reading.map((cursor) => cursor.track.rangeOf(cursor.sample)));
  return withinBytes(ByteRangeSet.of(needs), state.policy.aheadBytes).union(nextFrames);
}

/**
 * Once playing, what playback that starved would wait for, which the download keeps held; none
 * before.
 */
function thresholdOf(state: DownloadState, windowStart: WindowAnchor): ByteRangeSet {
  const need = { cursors: state.cursors, time: windowStart.time, policy: state.policy };
  return state.isReadingAhead ? resumeThresholdOf(need) : ByteRangeSet.empty;
}

interface TopUp {
  readonly state: DownloadState;
  readonly windowEnd: Seconds;
  readonly missing: ByteRangeSet;
  readonly threshold: ByteRangeSet;
}

/**
 * Whether to ask for what is missing now: a cursor waits on it, the resume threshold is not all
 * held, a refill's worth is missing, or the window reaches the last sample of every track read,
 * so no more will ever be missing.
 */
function isTopUpDue(topUp: TopUp): boolean {
  const { state, windowEnd, missing, threshold } = topUp;
  if (missing.ranges.some((range) => threshold.overlaps(range))) return true;
  const isStarving = state.cursors.some(
    (cursor) =>
      cursor.isWaiting &&
      !isAtItsEnd(cursor) &&
      missing.overlaps(cursor.track.rangeOf(cursor.sample)),
  );
  const isAtTheEnd = state.cursors.every((cursor) => isLastSampleWithin(cursor, windowEnd));
  return isStarving || isAtTheEnd || missing.totalLength >= state.policy.refillBytes;
}

function isLastSampleWithin(cursor: CursorPosition, windowEnd: Seconds): boolean {
  const { track } = cursor;
  return isAtItsEnd(cursor) || track.timestampOf(track.sampleCount - 1) <= windowEnd;
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
function keptBehind(anchor: WindowAnchor, policy: DownloadPolicy): ByteRangeSet {
  const start = keptBehindStart(anchor, policy);
  return ByteRangeSet.of([ByteRange.of(start, anchor.offset - start)]);
}

function keptBehindStart(anchor: WindowAnchor, policy: DownloadPolicy): number {
  return Math.max(0, anchor.offset - policy.keepBehindBytes);
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
