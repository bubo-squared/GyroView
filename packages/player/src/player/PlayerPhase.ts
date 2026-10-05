import { Deferred, type GyroViewError } from '@gyroview/core';

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
