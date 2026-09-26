import type { CaptureClock } from './CaptureClock';
import type { FrameTimes } from './FrameTimes';
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
  readonly readoutTime: Seconds;
  readonly exposureRecord: ExposureRecord | undefined;
  /**
   * Presentation timestamps of the video track's samples, in seconds from the track start, in
   * frame order. Supplied by the demuxer.
   */
  readonly trackTimestamps: readonly Seconds[] | undefined;
}

export interface FrameTimeSource {
  readonly name: FrameTimeSourceName;
  resolve(context: FrameTimingContext): FrameTimes | undefined;
}
