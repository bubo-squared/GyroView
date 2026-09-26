import type { Recording } from './Recording';
import type { VideoTrackReader } from '../../ports/Demuxer';
import type { CaptureClock } from '../../domain/motion/timing/CaptureClock';
import {
  planFrameTimes,
  type ResolvedFrameTimes,
} from '../../domain/motion/timing/resolveFrameTimes';

/**
 * Frame times for a frame source. The exposure record costs one small read and is always at
 * hand; the track's own timestamps are fetched only when the domain says the answer depends on
 * them, since walking the sample table is the costly part. Undefined when even nominal spacing
 * is impossible (no frame rate).
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
  const plan = planFrameTimes(
    { clock, frameCount, frameRate: info.frameRate, readoutTime: info.readoutTime, exposureRecord },
    info.preferredFrameTimeSource,
  );
  return plan.needsTrackTimestamps
    ? plan.resolveWith(await frameSource.sampleTimestamps())
    : plan.resolved;
}
