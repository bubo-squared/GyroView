import type {
  AudioSegmentSource,
  DisplayConversionParameters,
  FrameTimes,
  LensLayout,
  MediaBuffer,
  MotionSetup,
  Recording,
  Seconds,
  VersionedCalibration,
  VideoTrackReader,
} from '@gyroview/core';

import type { PlayerMetadata } from '../PlayerMetadata';

/**
 * A recording opened as far as the pipeline needs: metadata and sample tables read, layout
 * decided, decodability proven, timing and motion resolved. Owns the downloads of its files.
 */
export interface OpenedRecording {
  readonly recording: Recording;
  readonly layout: LensLayout;
  /**
   * One reader per decoded frame of a pair, in the order the stitching setup expects.
   */
  readonly frameSources: readonly VideoTrackReader[];
  readonly calibration: VersionedCalibration;
  /**
   * How each frame source is shown, in the order of {@link frameSources} (ADR 0033).
   */
  readonly displayConversions: readonly DisplayConversionParameters[];
  readonly duration: Seconds;
  readonly frameTimes: FrameTimes | undefined;
  readonly motion: MotionSetup | undefined;
  /**
   * Packages the recording's sound for the platform's media pipeline, where it has sound;
   * throws `codec-unsupported` for sound it cannot package.
   */
  readonly soundSegments: (() => AudioSegmentSource) | undefined;
  readonly metadata: PlayerMetadata;
  /**
   * What the recording lacked or had damaged, and the player worked around.
   */
  readonly warnings: readonly string[];
  /**
   * Playing has started: the downloads read ahead of the picture from now on (ADR 0029); until
   * then they read only what the picture waits for.
   */
  readAhead(): void;
  /**
   * What its downloads hold ahead, which playback that starved waits on (ADR 0011).
   */
  readonly buffer: MediaBuffer;
  /**
   * Gives up every download, what it has coming and every read of its tracks.
   */
  dispose(): void;
}
