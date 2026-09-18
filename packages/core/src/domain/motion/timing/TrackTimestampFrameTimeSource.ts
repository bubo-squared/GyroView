import type { FrameTimeSource, FrameTimingContext } from './FrameTimeSource';
import { FrameTimes } from './FrameTimes';
import { seconds } from '../../../shared/units/time';

/**
 * Uses the video track's own presentation timestamps, anchored at the first frame's capture time.
 */
export class TrackTimestampFrameTimeSource implements FrameTimeSource {
  public readonly name = 'track-timestamps';

  public resolve(context: FrameTimingContext): FrameTimes | undefined {
    const { trackTimestamps, clock, frameCount } = context;
    if (!trackTimestamps || trackTimestamps.length < frameCount) return undefined;
    const captureTimes = Float64Array.from(trackTimestamps.slice(0, frameCount), (timestamp) =>
      clock.captureTimeOf(seconds(timestamp)),
    );
    return FrameTimes.withoutShutterTimes(clock, captureTimes, context.readoutTime);
  }
}
