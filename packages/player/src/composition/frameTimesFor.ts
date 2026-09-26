import {
  resolveFrameTimes,
  seconds,
  type CaptureClock,
  type FrameTimingContext,
  type Recording,
  type ResolvedFrameTimes,
  type VideoTrackReader,
} from '@gyroview/core';

/**
 * Frame times for the recording's lens track. The exposure record is tried first because it
 * costs one small read; the track's own timestamps are fetched only when the cheap sources
 * leave nominal spacing as the answer, since walking the sample table is the costly part.
 * Undefined when even nominal spacing is impossible (no frame rate).
 */
export async function frameTimesFor(
  recording: Recording,
  track: VideoTrackReader,
  clock: CaptureClock,
): Promise<ResolvedFrameTimes | undefined> {
  const { info } = recording;
  const [frameCount, exposureRecord] = await Promise.all([
    track.frameCount(),
    recording.readExposureRecord(),
  ]);
  const context: FrameTimingContext = {
    clock,
    frameCount,
    frameRate: info.frameRate,
    readoutTime: info.readoutTime ?? seconds(0),
    exposureRecord,
    trackTimestamps: undefined,
  };
  const preferred = info.preferredFrameTimeSource;
  const cheap = resolveFrameTimes(context, preferred);
  if (cheap && cheap.source !== 'nominal') return cheap;
  const trackTimestamps = await track.sampleTimestamps();
  return resolveFrameTimes({ ...context, trackTimestamps }, preferred) ?? cheap;
}
