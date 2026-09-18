import type { FrameTimeSource, FrameTimingContext } from './FrameTimeSource';
import { FrameTimes } from './FrameTimes';

/**
 * Preferred source: the exposure record holds one entry per captured frame; entries before the
 * first encoded frame are pre-roll and are skipped.
 */
export class ExposureFrameTimeSource implements FrameTimeSource {
  public readonly name = 'exposure-record';

  public resolve(context: FrameTimingContext): FrameTimes | undefined {
    const { exposure, clock, frameCount } = context;
    if (!exposure) return undefined;
    const start = exposure.indexAtOrAfter(clock.firstFrameTimestamp);
    const hasEnoughEntries = exposure.length - start >= frameCount;
    return hasEnoughEntries
      ? new FrameTimes({
          clock,
          captureTimestamps: exposure.timestamps.slice(start, start + frameCount),
          exposures: exposure.exposures.slice(start, start + frameCount),
          readout: context.readout,
        })
      : undefined;
  }
}
