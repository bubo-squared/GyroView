import { frameTimesOf } from './frameTimesOf';
import { motionOf, type MotionSetup } from './motionOf';
import type { Recording } from './Recording';
import type { VideoTrackReader } from '../../ports/Demuxer';
import type { FrameTimeSourceName } from '../../domain/motion/timing/FrameTimeSource';
import type { FrameTimes } from '../../domain/motion/timing/FrameTimes';

/**
 * Everything time-related a player needs from a recording, each part optional: the recording
 * still plays without it, and a warning says what is missing.
 */
export interface RecordingTiming {
  readonly frameTimes: FrameTimes | undefined;
  readonly frameTimeSource: FrameTimeSourceName | undefined;
  readonly motion: MotionSetup | undefined;
  readonly warnings: readonly string[];
}

const NO_CLOCK_WARNING =
  'the recording has no capture clock; frame timing and stabilization are unavailable';
const NO_FRAME_SOURCE_WARNING =
  'the recording has no frame source to time; frame timing and stabilization are unavailable';
const NO_FRAME_TIMES_WARNING =
  'no frame timing source is usable; stabilization times each frame by its track timestamp';

/**
 * Relates the recording to video time: the capture clock, the frame times of its first frame
 * source (all sources share the camera clock) and the camera's orientation for stabilization.
 */
export async function timeRecording(
  recording: Recording,
  frameSource: VideoTrackReader | undefined,
): Promise<RecordingTiming> {
  const clock = await recording.captureClock();
  if (!clock) return withoutTiming([NO_CLOCK_WARNING]);
  if (!frameSource) return withoutTiming([NO_FRAME_SOURCE_WARNING]);
  const [frames, motion] = await Promise.all([
    frameTimesOf(recording, frameSource, clock),
    motionOf(recording, clock),
  ]);
  return {
    frameTimes: frames?.frameTimes,
    frameTimeSource: frames?.source,
    motion: motion.setup,
    warnings: [...(frames?.warnings ?? [NO_FRAME_TIMES_WARNING]), ...motion.warnings],
  };
}

function withoutTiming(warnings: readonly string[]): RecordingTiming {
  return { frameTimes: undefined, frameTimeSource: undefined, motion: undefined, warnings };
}
