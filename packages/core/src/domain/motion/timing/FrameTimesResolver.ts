import { ExposureFrameTimeSource } from './ExposureFrameTimeSource';
import type { FrameTimeSource, FrameTimeSourceName, FrameTimingContext } from './FrameTimeSource';
import type { FrameTimes } from './FrameTimes';
import { NominalFrameTimeSource } from './NominalFrameTimeSource';
import { TrackTimestampFrameTimeSource } from './TrackTimestampFrameTimeSource';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * Values of the info record's `pts_type` field: where the camera says frame times come from.
 */
export const PtsType = { TrackTimestamps: 1, ExposureRecord: 2 } as const;

export interface ResolvedFrameTimes {
  readonly frameTimes: FrameTimes;
  readonly source: FrameTimeSourceName;
  readonly warnings: readonly string[];
}

/**
 * Tries the frame time sources in the order the camera suggests, falling back gracefully and
 * saying which source won.
 */
export class FrameTimesResolver {
  private readonly exposure = new ExposureFrameTimeSource();
  private readonly trackTimestamps = new TrackTimestampFrameTimeSource();
  private readonly nominal = new NominalFrameTimeSource();

  public resolve(context: FrameTimingContext, ptsType: number | undefined): ResolvedFrameTimes {
    const warnings: string[] = [];
    for (const source of this.orderFor(ptsType)) {
      const frameTimes = source.resolve(context);
      if (frameTimes) return { frameTimes, source: source.name, warnings };
      warnings.push(`${source.name} unavailable`);
    }
    throw new GyroViewError(
      'no-frame-times',
      `no frame timing source is usable (${warnings.join('; ')})`,
    );
  }

  private orderFor(ptsType: number | undefined): readonly FrameTimeSource[] {
    return ptsType === PtsType.TrackTimestamps
      ? [this.trackTimestamps, this.exposure, this.nominal]
      : [this.exposure, this.trackTimestamps, this.nominal];
  }
}
