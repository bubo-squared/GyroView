import type {
  GyroViewError,
  PlayerState,
  Seconds,
  StabilizationMode,
  ViewState,
} from '@gyroview/core';

import type { PlayerMetadata } from '../PlayerMetadata';

/**
 * The session's states plus the two only the player knows: nothing loaded, and loading.
 */
export type PlayerStatus = 'idle' | 'loading' | PlayerState;

export interface PlayerEvents extends Record<string, unknown> {
  readonly statuschange: PlayerStatus;
  readonly ready: PlayerMetadata;
  readonly play: undefined;
  readonly pause: undefined;
  readonly ended: undefined;
  readonly timeupdate: Seconds;
  readonly seeking: Seconds;
  readonly seeked: Seconds;
  /**
   * A picture was drawn; the media time it shows.
   */
  readonly frame: Seconds;
  readonly viewchange: ViewState;
  readonly stabilizationchange: StabilizationMode;
  /**
   * A feature degraded gracefully (no gyro, unverified IMU frame, silent clock, proxy).
   */
  readonly warning: string;
  readonly error: GyroViewError;
}
