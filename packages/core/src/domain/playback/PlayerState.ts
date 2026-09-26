import { GyroViewError } from '../../shared/errors/GyroViewError';

export type PlayerState =
  'ready' | 'playing' | 'buffering' | 'paused' | 'seeking' | 'ended' | 'error' | 'disposed';

/**
 * Every legal transition; anything else is a programming error. A session is `ready` from
 * construction (its parts are already open). `buffering` is playing without a picture to show:
 * the clock waits for the decoders, on starting, after a seek and when they fall behind. A
 * seek always resumes through `buffering` or lands `paused`; the end is reached from `playing`
 * only; `error` leads only to `disposed`, which is terminal.
 */
const TRANSITIONS: Readonly<Record<PlayerState, readonly PlayerState[]>> = {
  ready: ['playing', 'buffering', 'paused', 'seeking', 'error', 'disposed'],
  playing: ['buffering', 'paused', 'seeking', 'ended', 'error', 'disposed'],
  buffering: ['playing', 'paused', 'seeking', 'error', 'disposed'],
  paused: ['playing', 'buffering', 'seeking', 'error', 'disposed'],
  seeking: ['buffering', 'paused', 'error', 'disposed'],
  ended: ['seeking', 'error', 'disposed'],
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
