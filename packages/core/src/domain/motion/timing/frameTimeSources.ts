import type { FrameTimeSourceName, FrameTimingContext } from './FrameTimeSource';
import { FrameTimes } from './FrameTimes';
import { seconds } from '../../../shared/units/time';

/**
 * A way to learn when each frame was captured; undefined when its inputs are missing.
 */
type FrameTimeSource = (context: FrameTimingContext) => FrameTimes | undefined;

/**
 * Preferred source: the exposure record holds one entry per captured frame; entries before the
 * first encoded frame are pre-roll and are skipped.
 */
function fromExposureRecord(context: FrameTimingContext): FrameTimes | undefined {
  const { exposureRecord, clock, frameCount } = context;
  if (!exposureRecord) return undefined;
  const start = exposureRecord.indexAtOrAfter(clock.firstFrameCaptureTime);
  if (exposureRecord.length - start < frameCount) return undefined;
  const frames = exposureRecord.slice(start, frameCount);
  return new FrameTimes({
    clock,
    captureTimes: Float64Array.from(frames.captureTimes),
    shutterTimes: Float64Array.from(frames.shutterTimes),
    frameDuration: context.frameDuration,
  });
}

/**
 * The video track's own presentation timestamps, which the clock relates to capture time from
 * where the track's first frame shows.
 */
function fromTrackTimestamps(context: FrameTimingContext): FrameTimes | undefined {
  const { trackTimestamps, clock, frameCount } = context;
  if (!trackTimestamps || trackTimestamps.length < frameCount) return undefined;
  const captureTimes = Float64Array.from(trackTimestamps.slice(0, frameCount), (timestamp) =>
    clock.captureTimeOf(timestamp),
  );
  return FrameTimes.withoutShutterTimes({
    clock,
    captureTimes,
    frameDuration: context.frameDuration,
  });
}

/**
 * Last resort: frames spaced evenly at the nominal frame rate from the first frame's capture
 * time. Exact enough for playback, too coarse for tight stabilization sync.
 */
function fromNominalRate(context: FrameTimingContext): FrameTimes | undefined {
  const { frameRate, clock, frameCount } = context;
  if (frameRate === undefined || frameRate <= 0) return undefined;
  const captureTimes = Float64Array.from({ length: frameCount }, (_unused, index) =>
    clock.captureTimeOf(seconds(clock.firstFrameVideoTime + index / frameRate)),
  );
  return FrameTimes.withoutShutterTimes({
    clock,
    captureTimes,
    frameDuration: context.frameDuration,
  });
}

/**
 * Each source by its name; a record, so a new name cannot be left without its source.
 */
export const FRAME_TIME_SOURCES: Readonly<Record<FrameTimeSourceName, FrameTimeSource>> = {
  'exposure-record': fromExposureRecord,
  'track-timestamps': fromTrackTimestamps,
  nominal: fromNominalRate,
};
