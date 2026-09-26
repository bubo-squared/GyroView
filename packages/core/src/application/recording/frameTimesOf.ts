import type { Recording } from './Recording';
import { seconds } from '../../shared/units/time';
import type { VideoTrackReader } from '../../ports/Demuxer';
import type { FrameTimingContext } from '../../domain/motion/timing/FrameTimeSource';
import type { CaptureClock } from '../../domain/motion/timing/CaptureClock';
import {
  requiresTrackTimestamps,
  resolveFrameTimes,
  type ResolvedFrameTimes,
} from '../../domain/motion/timing/resolveFrameTimes';

/**
 * Frame times for a frame source. The exposure record costs one small read and is always at
 * hand; the track's own timestamps are fetched only when the answer depends on them, since
 * walking the sample table is the costly part. Undefined when even nominal spacing is
 * impossible (no frame rate).
 */
export async function frameTimesOf(
  recording: Recording,
  frameSource: VideoTrackReader,
  clock: CaptureClock,
): Promise<ResolvedFrameTimes | undefined> {
  const { info } = recording;
  const [frameCount, exposureRecord] = await Promise.all([
    frameSource.frameCount(),
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
  const trackTimestamps = requiresTrackTimestamps(context, preferred)
    ? await frameSource.sampleTimestamps()
    : undefined;
  return resolveFrameTimes({ ...context, trackTimestamps }, preferred);
}
