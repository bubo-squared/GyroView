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
  for (const source of orderFor(preferred)) {
    const frameTimes = source.resolve(context);
    if (frameTimes) return { frameTimes, source: source.name, warnings };
    warnings.push(`${source.name} unavailable`);
  }
  return undefined;
}

/**
 * Whether the answer depends on the track's timestamps, which are costly to read: their source
 * comes, in the camera's order, before any source that answers without them.
 */
export function requiresTrackTimestamps(
  context: FrameTimingContext,
  preferred: FrameTimeSourceName | undefined,
): boolean {
  const withoutTimestamps = { ...context, trackTimestamps: undefined };
  const decisive = orderFor(preferred).find(
    (source) => source.name === 'track-timestamps' || source.resolve(withoutTimestamps),
  );
  return decisive?.name === 'track-timestamps';
}

function orderFor(preferred: FrameTimeSourceName | undefined): readonly FrameTimeSource[] {
  return preferred === 'track-timestamps' ? TRACK_TIMESTAMPS_FIRST : EXPOSURE_FIRST;
}
