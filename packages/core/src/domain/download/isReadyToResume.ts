import type { DownloadPolicy } from './DownloadPolicy';
import { needsOf, withinBytes, type CursorPosition } from './trackNeeds';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { seconds, type Seconds } from '../../shared/units/time';

/**
 * Where a file's readers stand, and where playback does.
 */
export interface ResumeNeed {
  readonly cursors: readonly CursorPosition[];
  readonly time: Seconds;
  readonly policy: DownloadPolicy;
}

export interface ResumeState extends ResumeNeed {
  readonly held: ByteRangeSet;
}

/**
 * What playback that starved at `time` waits for before it plays again (ADR 0011, ADR 0029):
 * every picture reader's frames up to the policy's resume seconds past it, or as many of them as
 * the budget holds less a request (a refill's worth, where that is less), so the download that
 * keeps it held still tops up in large ranges. Sound needs nothing of its own.
 */
export function resumeThresholdOf(need: ResumeNeed): ByteRangeSet {
  const { policy } = need;
  const until = seconds(need.time + policy.resumeSeconds);
  const pictures = need.cursors.filter((cursor) => cursor.track.kind === 'video');
  const needs = ByteRangeSet.of(pictures.flatMap((cursor) => needsOf(cursor, until)));
  const margin = Math.min(policy.requestSize, policy.refillBytes);
  return withinBytes(needs, policy.aheadBytes - margin);
}

/**
 * Whether the threshold is held: the download keeps it held once playing, so a download that
 * reads ahead is ready as soon as its bytes have come.
 */
export function isReadyToResume(state: ResumeState): boolean {
  return resumeThresholdOf(state).subtract(state.held).isEmpty;
}
