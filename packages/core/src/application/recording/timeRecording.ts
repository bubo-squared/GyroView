import { frameTimesOf, type FrameTimeline } from './frameTimesOf';
import { motionOf, type MotionSetup } from './motionOf';
import type { Recording } from './Recording';
import type { KeyframeTime } from '../../ports/VideoTrack';
import type { VideoTrackReader } from '../../ports/VideoTrackReader';
import type { CaptureClock } from '../../domain/motion/timing/CaptureClock';
import type { FrameTimeSourceName } from '../../domain/motion/timing/FrameTimeSource';
import type { FrameTimes } from '../../domain/motion/timing/FrameTimes';
import { hasErrorCode, messageOf } from '../../shared/errors/GyroViewError';
import { seconds, type Seconds } from '../../shared/units/time';

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

const TIMING_UNAVAILABLE = 'frame timing and stabilization are unavailable';
const NO_CLOCK_WARNING = `the recording has no capture clock; ${TIMING_UNAVAILABLE}`;
const NO_FRAME_SOURCE_WARNING = `the recording has no frame source to time; ${TIMING_UNAVAILABLE}`;
const NO_FRAME_TIMES_WARNING =
  'no frame timing source is usable; frames are timed by their track timestamps';

/**
 * Relates the recording to video time: the capture clock, the frame times of its first frame
 * source (all sources share the camera clock) and the camera's orientation for stabilization.
 */
export async function timeRecording(
  recording: Recording,
  frameSource: VideoTrackReader | undefined,
): Promise<RecordingTiming> {
  try {
    return await timeByTheClock(recording, frameSource);
  } catch (error) {
    // Without the info record's flag, a gyro record whose first samples fit neither layout
    // leaves the clock undated; the recording still plays, untimed.
    if (!hasErrorCode(error, 'unsupported-gyro-record')) throw error;
    return withoutTiming([`${messageOf(error)}; ${TIMING_UNAVAILABLE}`]);
  }
}

async function timeByTheClock(
  recording: Recording,
  frameSource: VideoTrackReader | undefined,
): Promise<RecordingTiming> {
  const { firstKey, frameDuration } = await firstKeyOf(frameSource);
  const recordingClock = await recording.captureClock(frameDuration);
  if (!recordingClock) return withoutTiming([NO_CLOCK_WARNING]);
  if (!frameSource) return withoutTiming([NO_FRAME_SOURCE_WARNING]);
  const timeline = timelineOf(recordingClock, firstKey, frameDuration);
  const [frames, motion] = await Promise.all([
    frameTimesOf(recording, frameSource, timeline),
    motionOf(recording, timeline.clock),
  ]);
  return {
    frameTimes: frames?.frameTimes,
    frameTimeSource: frames?.source,
    motion: motion.setup,
    warnings: [...(frames?.warnings ?? [NO_FRAME_TIMES_WARNING]), ...motion.warnings],
  };
}

/**
 * The frame source's first key frame, and its duration where it has one: what every other frame
 * follows at, the cameras recording at a constant rate.
 */
async function firstKeyOf(frameSource: VideoTrackReader | undefined): Promise<{
  readonly firstKey: KeyframeTime | undefined;
  readonly frameDuration: Seconds | undefined;
}> {
  const firstKey = await frameSource?.firstKeyframe();
  const hasDuration = firstKey !== undefined && firstKey.duration > 0;
  return { firstKey, frameDuration: hasDuration ? firstKey.duration : undefined };
}

/**
 * Where the frame source's frames lie in time: the first shows where the first key frame does
 * (a track without one does not decode), and the rest follow at that frame's duration.
 */
function timelineOf(
  recordingClock: CaptureClock,
  firstKey: KeyframeTime | undefined,
  frameDuration: Seconds | undefined,
): FrameTimeline {
  return {
    clock: recordingClock.withFirstFrameAt(firstKey?.timestamp ?? seconds(0)),
    frameDuration,
  };
}

function withoutTiming(warnings: readonly string[]): RecordingTiming {
  return { frameTimes: undefined, frameTimeSource: undefined, motion: undefined, warnings };
}
