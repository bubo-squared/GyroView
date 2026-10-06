import { PlayerStateMachine, type PlayerState } from '../../domain/playback/PlayerState';
import type { GyroViewError } from '../../shared/errors/GyroViewError';
import { Outbox } from '../../shared/events/Outbox';
import type { TypedEmitter } from '../../shared/events/TypedEmitter';
import type { Seconds } from '../../shared/units/time';

export interface PlaybackSessionEvents {
  readonly statechange: PlayerState;
  readonly timeupdate: Seconds;
  /**
   * The sink has drawn a new pair; the media time it was drawn at.
   */
  readonly present: Seconds;
  /**
   * The latest seek drew its first picture, or its decode ended without one: the time sought.
   */
  readonly seeked: Seconds;
  readonly ended: undefined;
  readonly error: GyroViewError;
}

/**
 * A session's state and what it announces. Each change the session makes through
 * {@link change} is heard once it is whole (ADR 0021): no listener runs in the middle of one,
 * and a listener's own change supersedes what the older one had still to announce.
 */
export class SessionLifecycle {
  private readonly machine = new PlayerStateMachine();
  private readonly outbox: Outbox<PlaybackSessionEvents>;

  public constructor(events: TypedEmitter<PlaybackSessionEvents>) {
    this.outbox = new Outbox(events);
  }

  public get current(): PlayerState {
    return this.machine.state;
  }

  public is(state: PlayerState): boolean {
    return this.machine.state === state;
  }

  public isOneOf(...states: readonly PlayerState[]): boolean {
    return this.machine.isOneOf(...states);
  }

  public canMoveTo(next: PlayerState): boolean {
    return this.machine.canTransitionTo(next);
  }

  public moveTo(next: PlayerState): void {
    this.machine.transitionTo(next);
    this.announce('statechange', next);
  }

  public announce<Name extends keyof PlaybackSessionEvents>(
    name: Name,
    payload: PlaybackSessionEvents[Name],
  ): void {
    this.outbox.emit(name, payload);
  }

  /**
   * Runs `make` as one change, announcing what it announced once the outermost change is whole.
   */
  public change<Result>(make: () => Result): Result {
    return this.outbox.change(make);
  }
}
