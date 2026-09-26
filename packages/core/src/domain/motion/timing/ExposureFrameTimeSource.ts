import type { FrameTimeSource, FrameTimingContext } from './FrameTimeSource';
import { FrameTimes } from './FrameTimes';

/**
 * Preferred source: the exposure record holds one entry per captured frame; entries before the
 * first encoded frame are pre-roll and are skipped.
 */
export class ExposureFrameTimeSource implements FrameTimeSource {
  public readonly name = 'exposure-record';

  public resolve(context: FrameTimingContext): FrameTimes | undefined {
    const { exposureRecord, clock, frameCount } = context;
    if (!exposureRecord) return undefined;
    const start = exposureRecord.indexAtOrAfter(clock.firstFrameCaptureTime);
    if (exposureRecord.length - start < frameCount) return undefined;
    const frames = exposureRecord.slice(start, frameCount);
    return new FrameTimes({
      clock,
      captureTimes: Float64Array.from(frames.captureTimes),
      shutterTimes: Float64Array.from(frames.shutterTimes),
      readoutTime: context.readoutTime,
      frameDuration: context.frameDuration,
    });
  }
}
