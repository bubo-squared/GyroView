import { hasErrorCode, messageOf, type EventSink } from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';

/**
 * The starts nobody pressed for: autoplay once a recording is ready, and the loop at its end. A
 * refused start leaves the recording loaded and paused: a warning, never a failure.
 */
export class AutomaticStarts {
  private isLoopingValue = false;

  public constructor(
    private readonly events: EventSink<PlayerEvents>,
    private readonly play: () => Promise<void>,
  ) {}

  public get isLooping(): boolean {
    return this.isLoopingValue;
  }

  public setLooping(isLooping: boolean): void {
    this.isLoopingValue = isLooping;
  }

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

  /**
   * The recording ended: announced, and played again when looping.
   */
  public ended(): void {
    this.events.emit('ended', undefined);
    if (this.isLoopingValue) void this.replay();
  }

  private async replay(): Promise<void> {
    try {
      await this.play();
    } catch (error) {
      this.events.emit('warning', {
        code: 'playback-failed',
        message: `the loop could not restart playback: ${messageOf(error)}`,
      });
    }
  }
}
