import type { PlaybackSession, PlayerState, TypedEmitter } from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';
import { transportEventsFor, type TransportEventName } from './transportEvents';

/**
 * What the relay reports to beyond the player's events.
 */
export interface RelayTargets {
  readonly events: TypedEmitter<PlayerEvents>;
  /**
   * The session's state, which is the player's status while a recording is loaded.
   */
  onState(state: PlayerState): void;
  onEnded(): void;
}

/**
 * Relays the loaded session's events in media-element terms: transport events for its state
 * changes, time updates, drawn frames, errors and the end. Listens to one session at a time and
 * stops before that session is disposed, so its disposal is never announced.
 */
export class SessionRelay {
  private stopListening: readonly (() => void)[] = [];
  private lastState: PlayerState | undefined;

  public constructor(private readonly targets: RelayTargets) {}

  public attach(session: PlaybackSession<VideoFrame>): void {
    this.detach();
    this.lastState = session.state;
    const { events } = this.targets;
    this.stopListening = [
      session.events.on('statechange', (state) => {
        this.onStateChange(state, session);
      }),
      session.events.on('timeupdate', (time) => {
        events.emit('timeupdate', time);
      }),
      session.events.on('present', (time) => {
        events.emit('frame', time);
      }),
      session.events.on('ended', () => {
        this.targets.onEnded();
      }),
      session.events.on('error', (error) => {
        events.emit('error', error);
      }),
    ];
  }

  public detach(): void {
    for (const stop of this.stopListening) stop();
    this.stopListening = [];
    this.lastState = undefined;
  }

  private onStateChange(state: PlayerState, session: PlaybackSession<VideoFrame>): void {
    const previous = this.lastState;
    this.lastState = state;
    for (const name of transportEventsFor(previous, state)) {
      this.emitTransport(name, session);
    }
    this.targets.onState(state);
  }

  private emitTransport(name: TransportEventName, session: PlaybackSession<VideoFrame>): void {
    const { events } = this.targets;
    if (name === 'seeking' || name === 'seeked') events.emit(name, session.currentTime);
    else events.emit(name, undefined);
  }
}
