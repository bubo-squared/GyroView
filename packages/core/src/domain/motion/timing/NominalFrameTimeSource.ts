import type { FrameTimeSource, FrameTimingContext } from './FrameTimeSource';
import { FrameTimes } from './FrameTimes';
import { seconds } from '../../../shared/units/time';

/**
 * Last resort: frames spaced evenly at the nominal frame rate from the first frame's capture
 * time. Exact enough for playback, too coarse for tight stabilization sync.
 */
export class NominalFrameTimeSource implements FrameTimeSource {
  public readonly name = 'nominal';

  public resolve(context: FrameTimingContext): FrameTimes | undefined {
    const { frameRate, clock, frameCount } = context;
    if (frameRate === undefined || frameRate <= 0) return undefined;
    const captureTimes = Float64Array.from({ length: frameCount }, (_unused, index) =>
      clock.captureTimeOf(seconds(index / frameRate)),
    );
    return FrameTimes.withoutShutterTimes(clock, captureTimes, context.readoutTime);
  }
}
