import type { GyroViewError } from '../shared/errors/GyroViewError';
import type { Seconds } from '../shared/units/time';

/**
 * Port: the master clock playback follows. An adapter over the recording's own audio lets the
 * picture follow the sound; recordings without audio use the core's WallClock.
 */
export interface PlaybackClock {
  readonly currentTime: Seconds;
  /**
   * Advancing now. The platform may stop a clock by itself (media keys, an audio interruption);
   * the session polls this on every tick and pauses with it.
   */
  readonly isRunning: boolean;
  /**
   * The clock's own media ran out; it will not advance again until seeked. A clock that does
   * not end by itself keeps this false.
   */
  readonly hasEnded: boolean;
  /**
   * Set once the clock can no longer advance because its media failed. The session polls it on
   * every tick and reports it; the core has no timers or events to be told otherwise.
   */
  readonly failure: GyroViewError | undefined;
  /**
   * Starts advancing, and counts as running from the call on, before the promise settles: the
   * session plays on at once, and a tick in between must not find a stopped clock and pause.
   * Rejects with `playback-blocked` when the platform refuses (autoplay policy); the caller then
   * waits for a user gesture.
   */
  start(): Promise<void>;
  pause(): void;
  seek(time: Seconds): void;
  dispose(): void;
}
