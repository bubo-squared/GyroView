import type { DownloadPolicy } from './DownloadPolicy';
import { needsOf, withinBytes, type CursorPosition } from './trackNeeds';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { seconds, type Seconds } from '../../shared/units/time';

export interface ResumeState {
  readonly cursors: readonly CursorPosition[];
  readonly held: ByteRangeSet;
  /**
   * Where playback stands.
   */
  readonly time: Seconds;
  readonly policy: DownloadPolicy;
}

/**
 * Whether enough of a file lies downloaded for playback that starved of it to play again (ADR
 * 0011, ADR 0029): every picture reader's frames up to the policy's resume seconds past the
 * playhead, or as many of them as the budget holds less one request, which a download that
 * reads ahead always reaches. Sound needs nothing of its own: it lies between the frames.
 */
export function isReadyToResume(state: ResumeState): boolean {
  const { policy } = state;
  const until = seconds(state.time + policy.resumeSeconds);
  const pictures = state.cursors.filter((cursor) => cursor.track.kind === 'video');
  const needs = ByteRangeSet.of(pictures.flatMap((cursor) => needsOf(cursor, until)));
  const threshold = withinBytes(needs, policy.aheadBytes - policy.requestSize);
  return threshold.subtract(state.held).isEmpty;
}
