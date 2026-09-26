import type { FrameTimeSource, FrameTimingContext } from './FrameTimeSource';
import { FrameTimes } from './FrameTimes';

/**
 * Uses the video track's own presentation timestamps, which the clock relates to capture time
 * from where the track's first frame shows.
 */
export class TrackTimestampFrameTimeSource implements FrameTimeSource {
  public readonly name = 'track-timestamps';

  public resolve(context: FrameTimingContext): FrameTimes | undefined {
    const { trackTimestamps, clock, frameCount } = context;
    if (!trackTimestamps || trackTimestamps.length < frameCount) return undefined;
    const captureTimes = Float64Array.from(trackTimestamps.slice(0, frameCount), (timestamp) =>
      clock.captureTimeOf(timestamp),
    );
    return FrameTimes.withoutShutterTimes(clock, captureTimes, context.readoutTime);
  }
}
