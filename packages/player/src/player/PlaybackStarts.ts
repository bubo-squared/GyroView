import { hasErrorCode, messageOf, type EventSink } from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';

/**
 * The starts nobody awaits: autoplay, once a recording is ready, and a press of play, a tap or a
 * key. A refused one leaves the recording loaded and paused: a warning, never a failure.
 */
export class PlaybackStarts {
  public constructor(
    private readonly events: EventSink<PlayerEvents>,
    private readonly play: () => Promise<void>,
  ) {}

  public async autoplay(): Promise<void> {
    try {
      await this.play();
    } catch (error) {
      this.events.emit(
        'warning',
        hasErrorCode(error, 'playback-blocked')
          ? { code: 'autoplay-blocked', message: 'playback waits for a user gesture' }
          : { code: 'playback-failed', message: `autoplay failed: ${messageOf(error)}` },
      );
    }
  }

  public press(): void {
    void this.play().catch((error: unknown) => {
      const message = `playback could not start: ${messageOf(error)}`;
      this.events.emit('warning', { code: 'playback-failed', message });
    });
  }
}
