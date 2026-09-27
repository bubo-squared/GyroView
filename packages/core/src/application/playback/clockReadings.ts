import type { PlaybackClock } from '../../ports/PlaybackClock';
import type { Seconds } from '../../shared/units/time';

/**
 * The platform stopped the clock by itself (media keys, an audio interruption): not running, yet
 * not at the end of its media.
 */
export function isStoppedFromOutside(clock: PlaybackClock): boolean {
  return !clock.isRunning && !clock.hasEnded;
}

/**
 * At the end of the recording: the clock's own media ran out, or it stands at the duration.
 */
export function isAtEndOfMedia(clock: PlaybackClock, duration: Seconds): boolean {
  return clock.hasEnded || clock.currentTime >= duration;
}
