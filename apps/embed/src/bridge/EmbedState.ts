import type { PictureQuality, StabilizationMode, ViewMode } from '@gyroview/core';
import type { PlayerMetadata, PlayerStatus, ViewAngles } from '@gyroview/player';

/**
 * The player's state as the embedding page sees it: a snapshot the host answers `getState`
 * with, and which the handle keeps current from the events it hears.
 */
export interface EmbedState {
  readonly status: PlayerStatus;
  readonly currentTime: number;
  readonly duration: number;
  readonly isPaused: boolean;
  readonly volume: number;
  readonly isMuted: boolean;
  readonly view: ViewAngles;
  readonly viewMode: ViewMode;
  readonly stabilization: StabilizationMode;
  readonly quality: PictureQuality;
  readonly metadata: PlayerMetadata | undefined;
}

/**
 * The attributes a `load` command may set; anything absent is removed.
 */
export interface LoadRequest {
  readonly src: string;
  readonly src2?: string;
}
