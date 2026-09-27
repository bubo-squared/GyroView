import type {
  AudioTrackReader,
  FrameTimes,
  LensLayout,
  MotionSetup,
  Recording,
  Seconds,
  VersionedCalibration,
  VideoTrackReader,
} from '@gyroview/core';

import type { PlayerMetadata } from '../PlayerMetadata';

/**
 * A recording opened as far as the pipeline needs: metadata read, inputs demuxed, layout
 * decided, decodability proven, timing and motion resolved. Owns the demuxed inputs.
 */
export interface OpenedRecording {
  readonly recording: Recording;
  readonly layout: LensLayout;
  /**
   * One reader per decoded frame of a pair, in the order the stitching setup expects.
   */
  readonly frameSources: readonly VideoTrackReader[];
  readonly calibration: VersionedCalibration;
  readonly duration: Seconds;
  readonly frameTimes: FrameTimes | undefined;
  readonly motion: MotionSetup | undefined;
  readonly audioTrack: AudioTrackReader | undefined;
  readonly metadata: PlayerMetadata;
  /**
   * What the recording lacked or had damaged, and the player worked around.
   */
  readonly warnings: readonly string[];
  dispose(): void;
}
