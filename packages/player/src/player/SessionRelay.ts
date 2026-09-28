import type { EventSink, PlaybackSession, PlayerState } from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';
import { transportEventsFor, type TransportEventName } from './transportEvents';

/**
 * What the relay reads of a session: its events, and its state and time when they change.
 */
export type RelayedSession = Pick<PlaybackSession, 'events' | 'state' | 'currentTime'>;

/**
 * What the relay reports to beyond the player's events.
 */
export interface RelayTargets {
  readonly events: EventSink<PlayerEvents>;
  /**
   * The session's state, which is the player's status while a recording is loaded.
   */
  onState(state: PlayerState): void;
  onEnded(): void;
}

/**
 * Relays the loaded session's events in media-element terms: transport events for its state
 * changes, time updates, drawn frames, errors and the end. Listens to one session at a time and
 * stops before that session is disposed, so its disposal is never announced. A change is relayed
 * whole, as a media element fires the events it queued before a listener's `pause()`; the
 * session announces a listener's newer change after it (ADR 0021).
 */
export class SessionRelay {
  private stopListening: readonly (() => void)[] = [];
  private lastState: PlayerState | undefined;
  /**
   * Counts detachments, so a change whose listener let the session go stops relaying.
   */
  private detachments = 0;

  public constructor(private readonly targets: RelayTargets) {}

  public attach(session: RelayedSession): void {
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
    this.detachments += 1;
  }

  private onStateChange(state: PlayerState, session: RelayedSession): void {
    const previous = this.lastState;
    this.lastState = state;
    const detachments = this.detachments;
    for (const name of transportEventsFor(previous, state)) {
      this.emitTransport(name, session);
      if (this.detachments !== detachments) return;
    }
    this.targets.onState(state);
  }

  private emitTransport(name: TransportEventName, session: RelayedSession): void {
    const { events } = this.targets;
    if (name === 'seeking' || name === 'seeked') events.emit(name, session.currentTime);
    else events.emit(name, undefined);
  }
}
