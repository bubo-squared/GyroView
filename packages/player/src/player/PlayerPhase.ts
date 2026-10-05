import { Deferred, GyroViewError } from '@gyroview/core';

import type { LoadedRecording } from './loadRecording';
import type { PlayerStatus } from './PlayerEvents';

/**
 * Where the player is with its recording; exactly one at a time, so no combination of flags can
 * say two things at once.
 */
export type PlayerPhase = IdlePhase | LoadingPhase | LoadedPhase | FailedPhase;

export interface IdlePhase {
  readonly kind: 'idle';
}

export interface LoadingPhase {
  readonly kind: 'loading';
  /**
   * Aborts the load when a newer one or an unload supersedes it.
   */
  readonly controller: AbortController;
  /**
   * Settles when this load ends, however it ends, so a `play()` asked meanwhile can follow it.
   */
  readonly settled: Deferred<void>;
}

export interface LoadedPhase {
  readonly kind: 'loaded';
  readonly loaded: LoadedRecording;
  /**
   * The load's controller: its signal still governs the recording's reads, which the unload
   * ends so nothing keeps downloading for a recording gone.
   */
  readonly controller: AbortController;
}

export interface FailedPhase {
  readonly kind: 'failed';
  readonly failure: GyroViewError;
}

export const IDLE: IdlePhase = { kind: 'idle' };

export function loadingPhase(): LoadingPhase {
  return { kind: 'loading', controller: new AbortController(), settled: new Deferred() };
}

/**
 * A loaded recording's status is its session's state, `seeking` until a seek's picture is drawn.
 */
export function statusOf(phase: PlayerPhase): PlayerStatus {
  switch (phase.kind) {
    case 'idle': {
      return 'idle';
    }
    case 'loading': {
      return 'loading';
    }
    case 'loaded': {
      const { session } = phase.loaded.pipeline;
      return session.isSeeking ? 'seeking' : session.state;
    }
    case 'failed': {
      return 'error';
    }
  }
}

/**
 * The session a `play` starts once the load it waited for, if it waited, has settled: the one
 * loaded, by that load. A failure is the load's; a load replaced meanwhile interrupts the play,
 * as a newer load interrupts a media element's.
 */
export function sessionToPlay(
  phase: PlayerPhase,
  waitedFor: LoadingPhase | undefined,
): LoadedRecording['pipeline']['session'] {
  if (phase.kind === 'failed') throw phase.failure;
  const isReplaced =
    waitedFor !== undefined &&
    (phase.kind !== 'loaded' || phase.controller !== waitedFor.controller);
  if (isReplaced) {
    throw new GyroViewError(
      'play-interrupted',
      'a newer load or an unload replaced the load to play',
    );
  }
  if (phase.kind !== 'loaded')
    throw new GyroViewError('no-source', 'there is no recording to play');
  return phase.loaded.pipeline.session;
}
