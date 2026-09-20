import {
  milliseconds,
  millisecondsToSeconds,
  resolveFrameTimes,
  type CaptureClock,
  type FrameTimingContext,
  type Recording,
  type ResolvedFrameTimes,
  type VideoTrackReader,
} from '@gyroview/core';

import { hasErrorCode } from './errorCodes';

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
    readoutTime: millisecondsToSeconds(milliseconds(info.readoutTimeMs ?? 0)),
    exposureRecord,
    trackTimestamps: undefined,
  };
  const cheap = tryResolve(context, info.ptsType);
  if (cheap && cheap.source !== 'nominal') return cheap;
  const trackTimestamps = await track.sampleTimestamps();
  return tryResolve({ ...context, trackTimestamps }, info.ptsType) ?? cheap;
}

function tryResolve(
  context: FrameTimingContext,
  ptsType: number | undefined,
): ResolvedFrameTimes | undefined {
  try {
    return resolveFrameTimes(context, ptsType);
  } catch (error) {
    if (hasErrorCode(error, 'no-frame-times')) return undefined;
    throw error;
  }
}
