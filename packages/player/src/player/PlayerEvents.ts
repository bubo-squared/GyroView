import type {
  GyroViewError,
  PlayerState,
  Seconds,
  StabilizationMode,
  ViewMode,
  ViewState,
} from '@gyroview/core';

import type { PlayerMetadata } from '../PlayerMetadata';

/**
 * The session's states plus the two only the player knows: nothing loaded, and loading.
 */
export type PlayerStatus = 'idle' | 'loading' | PlayerState;

/**
 * The sound as it is now: volume from 0 to 1, and whether it is muted.
 */
export interface SoundLevel {
  readonly volume: number;
  readonly isMuted: boolean;
}

export interface PlayerEvents {
  readonly statuschange: PlayerStatus;
  readonly ready: PlayerMetadata;
  readonly play: undefined;
  /**
   * Frames are ready and the clock runs: after `play` or after `waiting`.
   */
  readonly playing: undefined;
  /**
   * Playback holds for frames: on starting, after a seek, or when decoding falls behind.
   */
  readonly waiting: undefined;
  readonly pause: undefined;
  readonly ended: undefined;
  /**
   * The media time, every quarter second of playback and on a pause, a seek or the end.
   */
  readonly timeupdate: Seconds;
  readonly seeking: Seconds;
  readonly seeked: Seconds;
  /**
   * A picture was drawn; the media time it shows.
   */
  readonly frame: Seconds;
  readonly viewchange: ViewState;
  readonly viewmodechange: ViewMode;
  readonly stabilizationchange: StabilizationMode;
  /**
   * The volume or the mute changed, from whatever changed it.
   */
  readonly volumechange: SoundLevel;
  /**
   * Something the player worked around: a degraded feature (no gyro, an unverified IMU frame, a
   * silent clock), a refused autoplay, a loop that could not restart.
   */
  readonly warning: string;
  readonly error: GyroViewError;
}

/**
 * Every event name once; the record makes the compiler reject a missing or unknown name.
 */
const EVENT_NAMES: Readonly<Record<keyof PlayerEvents, true>> = {
  statuschange: true,
  ready: true,
  play: true,
  playing: true,
  waiting: true,
  pause: true,
  ended: true,
  timeupdate: true,
  seeking: true,
  seeked: true,
  frame: true,
  viewchange: true,
  viewmodechange: true,
  stabilizationchange: true,
  volumechange: true,
  warning: true,
  error: true,
};

export const PLAYER_EVENT_NAMES = Object.keys(EVENT_NAMES) as readonly (keyof PlayerEvents)[];
