import type { GyroViewError } from '../shared/errors/GyroViewError';
import type { Seconds } from '../shared/units/time';

/**
 * Port: the master clock playback follows. An adapter over the recording's own audio lets the
 * picture follow the sound; recordings without audio use the core's WallClock.
 */
export interface PlaybackClock {
  readonly currentTime: Seconds;
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
   * Starts advancing. Rejects with `playback-blocked` when the platform refuses (autoplay
   * policy); the caller then waits for a user gesture.
   */
  start(): Promise<void>;
  pause(): void;
  seek(time: Seconds): void;
  dispose(): void;
}
