import type { Seconds } from '../shared/units/time';

/**
 * Port: the master clock playback follows. The audio adapter implements it over an `<audio>`
 * element so picture follows sound; silent recordings use the core's WallClock.
 */
export interface PlaybackClock {
  readonly currentTime: Seconds;
  readonly isRunning: boolean;
  readonly rate: number;
  /**
   * Starts advancing. May reject when the platform blocks playback (autoplay policy).
   */
  start(): Promise<void>;
  stop(): void;
  seek(time: Seconds): void;
  setRate(rate: number): void;
  dispose(): void;
}
