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
  /**
   * Where the key frame that decoding at the anchor started from lies: a seek back within its
   * group decodes from there.
   */
  readonly keyframeOffset: number;
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
 * The download's plan, from where its readers stand (ADR 0029). The window starts at the
 * slowest picture reader, where the picture last stood once its readers closed (so the sound
 * after the last frame still comes), or at the sound where no picture was ever read; once
 * playing it reaches as far ahead as the policy's seconds and bytes allow, before that only to
 * what the readers wait for. Every picture reader's next frame is read, however far from the
 * others, so none waits for ever; a reader a seek left behind wants nothing until it follows.
 * What is wanted is asked for lowest first and in large ranges: at once when playback needs it
 * now, otherwise once a refill's worth is missing.
 */
export function planDownloads(state: DownloadState): DownloadDecisions {
  const pictures = state.cursors.filter((cursor) => isPicture(cursor));
  const anchor = pictures.length > 0 ? anchorOf(pictures) : state.anchor;
  const windowStart = anchor ?? soundLeadOf(state);
  if (!windowStart) return nothingToRead(state);
  const ahead = state.isReadingAhead ? state.policy.aheadSeconds : 0;
  const windowEnd = seconds(windowStart.time + ahead);
  const wanted = wantedBytes({ state, windowStart, windowEnd }).bridgingGapsBelow(
    state.policy.bridgedGap,
  );
  // A transfer whose bytes have all come only waits for its end: giving it up gains nothing.
  const kept = state.transfers.filter(
    (transfer) => transfer.remaining.length === 0 || wanted.overlaps(transfer.remaining),
  );
  const coming = ByteRangeSet.of(kept.map((transfer) => transfer.remaining));
  const missing = wanted.subtract(state.held).subtract(coming).subtract(state.unreadable);
  const room = state.policy.requestsInFlight - kept.length;
  const threshold = thresholdOf(state, windowStart);
  const isDue = isTopUpDue({ state, windowStart, windowEnd, missing, threshold });
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
    keyframeOffset: Math.min(...cursors.map((cursor) => keyframeOffsetOf(cursor))),
  };
}

interface Window {
  readonly state: DownloadState;
  readonly windowStart: WindowAnchor;
  readonly windowEnd: Seconds;
}

/**
 * Every sample the readers following the picture will hand out within the window, clipped to
 * the bytes the policy allows ahead, nearest first; and the next sample of every picture reader
 * and of every reader waiting within the window, whatever the budget and wherever the file
 * puts it, so no reader waits for ever.
 */
function wantedBytes(window: Window): ByteRangeSet {
  const { state, windowEnd } = window;
  const following = state.cursors.filter((cursor) => isFollowing(cursor, window));
  const needs = following.flatMap((cursor) => needsOf(cursor, laterOf(windowEnd, cursor.target)));
  const next = following.filter((cursor) => isNextSampleOwed(cursor, windowEnd));
  const nextSamples = ByteRangeSet.of(next.map((cursor) => cursor.track.rangeOf(cursor.sample)));
  return withinBytes(ByteRangeSet.of(needs), state.policy.aheadBytes).union(nextSamples);
}

/**
 * A reader no further behind the picture than the policy allows: the sound lags the picture
 * by the decoders' lead, and until it follows a seek it stands far behind.
 */
function isFollowing(cursor: CursorPosition, window: Window): boolean {
  return timeOf(cursor) >= window.windowStart.time - window.state.policy.keepBehindSeconds;
}

function isNextSampleOwed(cursor: CursorPosition, windowEnd: Seconds): boolean {
  const isWaitingWithin = cursor.isWaiting && timeOf(cursor) <= windowEnd;
  return !isAtItsEnd(cursor) && (isPicture(cursor) || isWaitingWithin);
}

function laterOf(time: Seconds, other: Seconds | undefined): Seconds {
  return other !== undefined && other > time ? other : time;
}

function isPicture(cursor: CursorPosition): boolean {
  return cursor.track.kind === 'video';
}

/**
 * Once playing, what playback that starved would wait for, which the download keeps held; none
 * before.
 */
function thresholdOf(state: DownloadState, windowStart: WindowAnchor): ByteRangeSet {
  const need = { cursors: state.cursors, time: windowStart.time, policy: state.policy };
  return state.isReadingAhead ? resumeThresholdOf(need) : ByteRangeSet.empty;
}

interface TopUp extends Window {
  readonly missing: ByteRangeSet;
  readonly threshold: ByteRangeSet;
}

/**
 * Whether to ask for what is missing now: a reader needs it at once, the resume threshold is
 * not all held, or a refill's worth is missing. The last seconds of the tracks come as the
 * threshold reaches them, however few their bytes.
 */
function isTopUpDue(topUp: TopUp): boolean {
  const { state, missing, threshold } = topUp;
  if (missing.ranges.some((range) => threshold.overlaps(range))) return true;
  const isStarving = state.cursors.some(
    (cursor) =>
      isNeededAtOnce(cursor, topUp) && missing.overlaps(cursor.track.rangeOf(cursor.sample)),
  );
  return isStarving || missing.totalLength >= state.policy.refillBytes;
}

/**
 * A reader waiting on a sample playback needs now: a picture's, or one due within the resume
 * seconds. Sound that buffers far ahead waits where the downloaded bytes end, and would
 * otherwise ask for a small range every time the picture moved.
 */
function isNeededAtOnce(cursor: CursorPosition, topUp: TopUp): boolean {
  if (!cursor.isWaiting || isAtItsEnd(cursor)) return false;
  const { windowStart, state } = topUp;
  const horizon = windowStart.time + (state.isReadingAhead ? state.policy.resumeSeconds : 0);
  return isPicture(cursor) || timeOf(cursor) <= horizon;
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
 * The stretch behind the picture that is kept for short seeks back: its group of pictures from
 * the key frame, or the policy's distance, whichever reaches further back.
 */
function keptBehind(anchor: WindowAnchor, policy: DownloadPolicy): ByteRangeSet {
  const start = keptBehindStart(anchor, policy);
  return ByteRangeSet.of([ByteRange.of(start, anchor.offset - start)]);
}

function keptBehindStart(anchor: WindowAnchor, policy: DownloadPolicy): number {
  return Math.max(0, Math.min(anchor.keyframeOffset, anchor.offset - policy.keepBehindBytes));
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

/**
 * Where the key frame before a reader's next sample lies; a sound sample is its own.
 */
function keyframeOffsetOf(cursor: CursorPosition): number {
  const { track } = cursor;
  const last = Math.min(cursor.sample, track.sampleCount - 1);
  const keyframe = track.syncSampleAtOrBefore(last);
  return keyframe === undefined ? offsetOf(cursor) : track.rangeOf(keyframe).offset;
}

function offsetOf(cursor: CursorPosition): number {
  const { track } = cursor;
  if (!isAtItsEnd(cursor)) return track.rangeOf(cursor.sample).offset;
  return track.sampleCount > 0 ? track.rangeOf(track.sampleCount - 1).end : 0;
}
