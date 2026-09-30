import type { VideoTrackReader } from '../../ports/VideoTrackReader';
import type { Seconds } from '../../shared/units/time';

/**
 * The time of the key frame at or before `time`, where a dragged seek bar can show a picture at
 * once; `time` itself when the track has none there or cannot say (a recording let go meanwhile).
 * A read that is truly broken then fails the decode, where the session reports it.
 */
export async function keyframeTimeAt(track: VideoTrackReader, time: Seconds): Promise<Seconds> {
  try {
    const keyframe = await track.keyframeAt(time);
    return keyframe?.timestamp ?? time;
  } catch {
    return time;
  }
}
