import type {
  AudioTrackReader,
  CalibrationSet,
  FrameTimes,
  LensLayout,
  Recording,
  Seconds,
  VideoTrackReader,
} from '@gyroview/core';

import type { MotionSetup } from './motionSetupFor';
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
  readonly calibration: CalibrationSet;
  readonly duration: Seconds;
  readonly frameTimes: FrameTimes | undefined;
  readonly motion: MotionSetup | undefined;
  readonly audioTrack: AudioTrackReader | undefined;
  readonly metadata: PlayerMetadata;
  readonly warnings: readonly string[];
  dispose(): void;
}
