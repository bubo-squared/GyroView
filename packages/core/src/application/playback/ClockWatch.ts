import type { Seconds } from '../../shared/units/time';

/**
 * This much media time between two playing ticks means the ticks stopped while the clock ran on
 * (a hidden tab or an offscreen frame gets no animation frames). Ticks come with every animation
 * frame, a few hundredths of a second apart at the slowest.
 */
const MISSED_TICKS_SECONDS = 1;
/**
 * A clock found this far from where it was last seen or put was moved from outside: the lock
 * screen's scrubber, a media key's play from the end. A running clock covers a few hundredths of
 * a second between two ticks.
 */
const OUTSIDE_MOVE_SECONDS = 0.25;

/**
 * What a playback session's ticks notice about its clock between them: that the platform moved
 * it, or that ticks were missed while it ran on.
 */
export class ClockWatch {
  private position: Seconds | undefined;
  private previousPlayingTick: Seconds | undefined;

  /**
   * The session put the clock here itself.
   */
  public placedAt(time: Seconds): void {
    this.position = time;
  }

  /**
   * Playing starts from here: ticks that never come from now on are missed ticks too, as when
   * playback starts in a hidden tab.
   */
  public playingFrom(time: Seconds): void {
    this.previousPlayingTick = time;
  }

  /**
   * A new run starts a new timeline, on which no tick has been seen yet.
   */
  public forgetTicks(): void {
    this.previousPlayingTick = undefined;
  }

  /**
   * Whether the clock is not where it was last seen or put: moved back while playing, or moved at
   * all while standing still. Notes where it is now.
   */
  public wasMovedFromOutside(now: Seconds, isPlaying: boolean): boolean {
    const known = this.position;
    this.position = now;
    if (known === undefined) return false;
    const distance = isPlaying ? known - now : Math.abs(now - known);
    return distance > OUTSIDE_MOVE_SECONDS;
  }

  /**
   * Whether the clock ran on for a while since the last playing tick. Notes this tick.
   */
  public wereTicksMissed(now: Seconds, isPlaying: boolean): boolean {
    const previous = this.previousPlayingTick;
    this.previousPlayingTick = isPlaying ? now : undefined;
    const gap = previous === undefined ? 0 : now - previous;
    return isPlaying && gap > MISSED_TICKS_SECONDS;
  }
}
