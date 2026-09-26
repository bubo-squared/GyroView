import { frameTimesOf } from './frameTimesOf';
import { motionOf, type MotionSetup } from './motionOf';
import type { Recording } from './Recording';
import type { VideoTrackReader } from '../../ports/Demuxer';
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
  const recordingClock = await recording.captureClock();
  if (!recordingClock) return withoutTiming([NO_CLOCK_WARNING]);
  if (!frameSource) return withoutTiming([NO_FRAME_SOURCE_WARNING]);
  const clock = recordingClock.withFirstFrameAt(await firstFrameTimeOf(frameSource));
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

/**
 * Where the track's first frame shows, which its first key packet opens; zero for a track
 * without one, which does not decode anyway.
 */
async function firstFrameTimeOf(frameSource: VideoTrackReader): Promise<Seconds> {
  const firstKey = await frameSource.firstKeyPacket();
  return firstKey?.timestamp ?? seconds(0);
}

function withoutTiming(warnings: readonly string[]): RecordingTiming {
  return { frameTimes: undefined, frameTimeSource: undefined, motion: undefined, warnings };
}
