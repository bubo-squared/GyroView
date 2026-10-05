import type { EventSink, Outbox } from '@gyroview/core';

import type { PlayerEvents, PlayerStatus } from './PlayerEvents';

/**
 * Announces the player's status once for each change: a status announced again before listeners
 * heard the other one in between is heard once.
 */
export class StatusAnnouncer {
  /**
   * The status listeners heard last.
   */
  private lastStatus: PlayerStatus = 'idle';

  public constructor(
    private readonly outbox: Outbox<PlayerEvents>,
    private readonly emitter: EventSink<PlayerEvents>,
  ) {}

  /**
   * Whether listeners hear it is decided once the change is whole, against what they heard last.
   */
  public announce(status: PlayerStatus): void {
    this.outbox.post(() => {
      if (status === this.lastStatus) return;
      this.lastStatus = status;
      this.emitter.emit('statuschange', status);
    });
  }
}
