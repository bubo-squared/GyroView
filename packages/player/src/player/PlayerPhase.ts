import type { Deferred, GyroViewError } from '@gyroview/core';

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
}

export interface FailedPhase {
  readonly kind: 'failed';
  readonly failure: GyroViewError;
}

export const IDLE: IdlePhase = { kind: 'idle' };

export function statusOf(phase: PlayerPhase): PlayerStatus {
  switch (phase.kind) {
    case 'idle': {
      return 'idle';
    }
    case 'loading': {
      return 'loading';
    }
    case 'loaded': {
      return phase.loaded.pipeline.session.state;
    }
    case 'failed': {
      return 'error';
    }
  }
}
