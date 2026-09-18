import type { FrameTimeSource, FrameTimingContext } from './FrameTimeSource';
import { FrameTimes } from './FrameTimes';
import { seconds } from '../../../shared/units/time';

/**
 * Uses the video track's own presentation timestamps, rebased so that the first sample lands on
 * the first frame's capture time (tracks with edit lists do not start at zero).
 */
export class TrackTimestampFrameTimeSource implements FrameTimeSource {
  public readonly name = 'track-timestamps';

  public resolve(context: FrameTimingContext): FrameTimes | undefined {
    const { trackTimestamps, clock, frameCount } = context;
    if (!trackTimestamps || trackTimestamps.length < frameCount) return undefined;
    const origin = trackTimestamps[0] ?? 0;
    const captureTimes = Float64Array.from(trackTimestamps.slice(0, frameCount), (timestamp) =>
      clock.captureTimeOf(seconds(timestamp - origin)),
    );
    return FrameTimes.withoutShutterTimes(clock, captureTimes, context.readoutTime);
  }
}
