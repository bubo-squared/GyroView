import { GyroViewError } from '../../shared/errors/GyroViewError';

export type PlayerState =
  'ready' | 'playing' | 'paused' | 'seeking' | 'ended' | 'error' | 'disposed';

/**
 * Every legal transition; anything else is a programming error. A session is `ready` from
 * construction (its parts are already open), `error` leads only to `disposed`, and `disposed`
 * is terminal. Buffering is not a state yet: underrun handling belongs to the hardening phase.
 */
const TRANSITIONS: Readonly<Record<PlayerState, readonly PlayerState[]>> = {
  ready: ['playing', 'paused', 'seeking', 'error', 'disposed'],
  playing: ['paused', 'seeking', 'ended', 'error', 'disposed'],
  paused: ['playing', 'seeking', 'error', 'disposed'],
  seeking: ['playing', 'paused', 'error', 'disposed'],
  ended: ['playing', 'seeking', 'error', 'disposed'],
  error: ['disposed'],
  disposed: [],
};

/**
 * Explicit player lifecycle instead of a set of booleans.
 */
export class PlayerStateMachine {
  private current: PlayerState = 'ready';

  public get state(): PlayerState {
    return this.current;
  }

  public canTransitionTo(next: PlayerState): boolean {
    return TRANSITIONS[this.current].includes(next);
  }

  public transitionTo(next: PlayerState): void {
    if (!this.canTransitionTo(next)) {
      throw new GyroViewError(
        'invariant-violation',
        `player cannot go from ${this.current} to ${next}`,
      );
    }
    this.current = next;
  }

  public isOneOf(...states: readonly PlayerState[]): boolean {
    return states.includes(this.current);
  }
}

/**
 * The transition table, for tests and documentation.
 */
export function transitionsFrom(state: PlayerState): readonly PlayerState[] {
  return TRANSITIONS[state];
}
