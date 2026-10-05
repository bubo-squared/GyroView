import type { Buffering } from './Buffering';
import type { ClockWatch } from './ClockWatch';
import type { SessionLifecycle } from './SessionLifecycle';
import type { PlaybackClock } from '../../ports/PlaybackClock';

/**
 * What a start works with, all borrowed from the session.
 */
export interface ClockStartParts {
  readonly clock: PlaybackClock;
  readonly lifecycle: SessionLifecycle;
  readonly clockWatch: ClockWatch;
  readonly buffering: Buffering;
}

/**
 * Moves a session to `playing` and starts its clock once that has been heard, unless a listener
 * paused on it: an audio element told to pause while it starts refuses the start. A clock that
 * refuses to start (the autoplay policy) lands the session `paused`.
 */
export class ClockStart {
  public constructor(private readonly parts: ClockStartParts) {}

  /**
   * Playing now, and the clock started once that is heard: what a `play` awaits.
   */
  public begin(): Promise<void> {
    this.enterPlaying();
    return this.startOnceHeard();
  }

  /**
   * Leaves `buffering` for `playing` and starts the clock; a refusal lands `paused` and is
   * reported to the `play` waiting, if one is.
   */
  public async resume(): Promise<void> {
    const attempt = this.parts.buffering.takeStart();
    this.enterPlaying();
    try {
      await this.startOnceHeard();
      attempt?.resolve();
    } catch (error) {
      attempt?.reject(error);
    }
  }

  /**
   * Playing from the clock's time now: ticks that never come from here on are missed ticks
   * too, as when playback starts in a hidden tab or an offscreen frame.
   */
  private enterPlaying(): void {
    this.parts.clockWatch.playingFrom(this.parts.clock.currentTime);
    this.parts.lifecycle.moveTo('playing');
  }

  private async startOnceHeard(): Promise<void> {
    await Promise.resolve();
    if (this.parts.lifecycle.is('playing')) await this.startClock();
  }

  private async startClock(): Promise<void> {
    try {
      await this.parts.clock.start();
    } catch (error) {
      if (this.parts.lifecycle.is('playing')) this.parts.lifecycle.moveTo('paused');
      throw error;
    }
  }
}
