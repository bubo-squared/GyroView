import type { Recording } from './Recording';
import type { VideoTrackReader } from '../../ports/VideoTrackReader';
import type { CaptureClock } from '../../domain/motion/timing/CaptureClock';
import type { Seconds } from '../../shared/units/time';
import {
  planFrameTimes,
  type ResolvedFrameTimes,
} from '../../domain/motion/timing/resolveFrameTimes';

/**
 * Where a frame source's frames lie in time: the clock relating capture time to video time from
 * the first frame's, and the spacing at which the track presents the frames.
 */
export interface FrameTimeline {
  readonly clock: CaptureClock;
  readonly frameDuration: Seconds | undefined;
}

/**
 * Frame times for a frame source. The exposure record costs one small read and is always at
 * hand; the track's own timestamps are fetched only when the domain says the answer depends on
 * them, since walking the sample table is the costly part. Undefined when even nominal spacing
 * is impossible (no frame rate).
 */
export async function frameTimesOf(
  recording: Recording,
  frameSource: VideoTrackReader,
  timeline: FrameTimeline,
): Promise<ResolvedFrameTimes | undefined> {
  const { info } = recording;
  const [frameCount, exposureRecord] = await Promise.all([
    frameSource.frameCount(),
    recording.readExposureRecord(),
  ]);
  const plan = planFrameTimes(
    {
      ...timeline,
      frameCount,
      frameRate: info.frameRate,
      exposureRecord,
    },
    info.preferredFrameTimeSource,
  );
  return plan.needsTrackTimestamps
    ? plan.resolveWith(await frameSource.sampleTimestamps())
    : plan.resolved;
}
