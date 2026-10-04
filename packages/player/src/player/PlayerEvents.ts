import {
  keysOf,
  type GyroViewError,
  type PictureQuality,
  type PlayerState,
  type StabilizationMode,
  type ViewMode,
} from '@gyroview/core';

import type { ViewAngles } from './PlayerOptions';
import type { PlayerMetadata } from '../PlayerMetadata';

/**
 * The session's states plus the two only the player knows: nothing loaded, and loading.
 */
export type PlayerStatus = 'idle' | 'loading' | PlayerState;

/**
 * Motion look as it stands: `unavailable` where the device reports no attitude or access was
 * refused, `off`, or `on`, the device turning the normal view (ADR 0040).
 */
export type MotionLookState = 'unavailable' | 'off' | 'on';

/**
 * The sound as it is now: volume from 0 to 1, and whether it is muted.
 */
export interface SoundLevel {
  readonly volume: number;
  readonly isMuted: boolean;
}

/**
 * What a `warning` is about, for a page that acts on some and not others:
 * - `recording-degraded`: the recording lacks, or has damaged, data the player works around (no
 *   gyro, an unverified IMU frame, fallback frame times or calibration); `ready`'s metadata says
 *   what it got.
 * - `no-sound`: the recording has no sound, or none this browser plays; a silent clock runs.
 * - `autoplay-blocked`: the browser waits for a user gesture before it starts playback.
 * - `playback-failed`: a start (a press, autoplay, the loop) or the seek bar's preview failed.
 * - `ignored-attribute`: an attribute's value names nothing the element knows; the setting stays.
 * - `refused-property`: a property set before the element was defined was refused.
 * - `motion-look-refused`: the viewer, or an iframe's `allow`, refused access to the device's
 *   attitude; motion look is unavailable.
 * - `motion-look-needs-gesture`: motion look was started outside a user gesture, where iOS does
 *   not ask; it stays off.
 */
export type WarningCode =
  | 'recording-degraded'
  | 'no-sound'
  | 'autoplay-blocked'
  | 'playback-failed'
  | 'ignored-attribute'
  | 'refused-property'
  | 'motion-look-refused'
  | 'motion-look-needs-gesture';

export interface PlayerWarning {
  readonly code: WarningCode;
  /**
   * What happened exactly, for a developer.
   */
  readonly message: string;
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
  readonly timeupdate: number;
  readonly seeking: number;
  readonly seeked: number;
  /**
   * A picture was drawn; the media time it shows.
   */
  readonly frame: number;
  readonly viewchange: ViewAngles;
  readonly viewmodechange: ViewMode;
  readonly motionlookchange: MotionLookState;
  readonly stabilizationchange: StabilizationMode;
  /**
   * The picture quality changed, to the one named.
   */
  readonly qualitychange: PictureQuality;
  /**
   * The volume or the mute changed, from whatever changed it.
   */
  readonly volumechange: SoundLevel;
  /**
   * Something the player worked around; the code says what, the message says it exactly.
   */
  readonly warning: PlayerWarning;
  readonly error: GyroViewError;
}

/**
 * Every event name once.
 */
export const PLAYER_EVENT_NAMES = keysOf<keyof PlayerEvents>({
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
  motionlookchange: true,
  stabilizationchange: true,
  qualitychange: true,
  volumechange: true,
  warning: true,
  error: true,
});
