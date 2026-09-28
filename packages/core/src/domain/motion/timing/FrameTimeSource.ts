import type { CaptureClock } from './CaptureClock';
import type { Seconds } from '../../../shared/units/time';
import type { ExposureRecord } from '../exposure/ExposureRecord';

export type FrameTimeSourceName = 'exposure-record' | 'track-timestamps' | 'nominal';

/**
 * Everything a strategy may draw on. Fields are optional because cameras and firmware differ in
 * what they write; each strategy declines (returns undefined) when its inputs are missing.
 */
export interface FrameTimingContext {
  readonly clock: CaptureClock;
  readonly frameCount: number;
  readonly frameRate: number | undefined;
  /**
   * Undefined when the camera does not say; the frames are then treated as read out at once.
   */
  readonly readoutTime: Seconds | undefined;
  readonly exposureRecord: ExposureRecord | undefined;
  /**
   * Presentation timestamps of the video track's samples, in seconds from the track start, in
   * frame order. Supplied by the demuxer.
   */
  readonly trackTimestamps: readonly Seconds[] | undefined;
  /**
   * How far apart the track presents its frames; undefined when it does not say.
   */
  readonly frameDuration: Seconds | undefined;
}
