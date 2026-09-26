import { ExposureFrameTimeSource } from './ExposureFrameTimeSource';
import type { FrameTimeSource, FrameTimeSourceName, FrameTimingContext } from './FrameTimeSource';
import type { FrameTimes } from './FrameTimes';
import { NominalFrameTimeSource } from './NominalFrameTimeSource';
import { TrackTimestampFrameTimeSource } from './TrackTimestampFrameTimeSource';

export interface ResolvedFrameTimes {
  readonly frameTimes: FrameTimes;
  readonly source: FrameTimeSourceName;
  readonly warnings: readonly string[];
}

const EXPOSURE_FIRST: readonly FrameTimeSource[] = [
  new ExposureFrameTimeSource(),
  new TrackTimestampFrameTimeSource(),
  new NominalFrameTimeSource(),
];
const TRACK_TIMESTAMPS_FIRST: readonly FrameTimeSource[] = [
  new TrackTimestampFrameTimeSource(),
  new ExposureFrameTimeSource(),
  new NominalFrameTimeSource(),
];

/**
 * Tries the frame time sources in the order the camera suggests, falling back gracefully and
 * saying which source won. Undefined when none can say (not even a nominal frame rate):
 * frame times are optional, the picture still plays at the track's pace.
 */
export function resolveFrameTimes(
  context: FrameTimingContext,
  preferred: FrameTimeSourceName | undefined,
): ResolvedFrameTimes | undefined {
  const warnings: string[] = [];
  const order = preferred === 'track-timestamps' ? TRACK_TIMESTAMPS_FIRST : EXPOSURE_FIRST;
  for (const source of order) {
    const frameTimes = source.resolve(context);
    if (frameTimes) return { frameTimes, source: source.name, warnings };
    warnings.push(`${source.name} unavailable`);
  }
  return undefined;
}
