import type {
  CalibrationVersion,
  FrameTimeSourceName,
  LensLayoutKind,
  Seconds,
  VideoTrackDescription,
} from '@gyroview/core';

export interface ImuFrameSummary {
  readonly name: string;
  readonly isVerified: boolean;
}

/**
 * What the player learned about a recording while opening it, for the `ready` event: enough for
 * an embedder to know which camera, layout and degraded features it got.
 */
export interface PlayerMetadata {
  readonly model: string | undefined;
  readonly firmware: string | undefined;
  readonly captureMode: string | undefined;
  readonly layout: LensLayoutKind;
  readonly layoutEvidence: readonly string[];
  /**
   * The lens tracks in lens order.
   */
  readonly tracks: readonly VideoTrackDescription[];
  readonly calibrationVersion: CalibrationVersion;
  readonly frameTimeSource: FrameTimeSourceName | undefined;
  readonly hasGyro: boolean;
  readonly imuFrame: ImuFrameSummary | undefined;
  readonly hasAudio: boolean;
  readonly duration: Seconds;
}
