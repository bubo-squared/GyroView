import { hasErrorCode, messageOf, type EventSink } from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';

/**
 * The start nobody pressed for, once a recording is ready. A refused start leaves the recording
 * loaded and paused: a warning, never a failure.
 */
export class Autoplay {
  public constructor(
    private readonly events: EventSink<PlayerEvents>,
    private readonly play: () => Promise<void>,
  ) {}

  public async start(): Promise<void> {
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
}
