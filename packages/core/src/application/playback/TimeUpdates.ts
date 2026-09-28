import type { SessionLifecycle } from './SessionLifecycle';
import type { Seconds } from '../../shared/units/time';

/**
 * How much media time passes between two announcements while playing: the slowest cadence of a
 * media element's `timeupdate`, often enough for a seek bar and cheap to relay across
 * `postMessage`.
 */
const INTERVAL_SECONDS = 0.25;

/**
 * The cadence of a session's `timeupdate`: every quarter second of playback, and at once when
 * the session says so (a pause, a seek, the end).
 */
export class TimeUpdates {
  private announced: Seconds | undefined;

  public constructor(private readonly lifecycle: Pick<SessionLifecycle, 'announce'>) {}

  public announce(time: Seconds): void {
    this.announced = time;
    this.lifecycle.announce('timeupdate', time);
  }

  /**
   * Announces the time if a quarter second of playback passed since the last announcement.
   */
  public followPlayback(now: Seconds): void {
    const { announced } = this;
    const isDue = announced === undefined || Math.abs(now - announced) >= INTERVAL_SECONDS;
    if (isDue) this.announce(now);
  }
}
