import { ExposureFrameTimeSource } from './ExposureFrameTimeSource';
import type { FrameTimeSource, FrameTimeSourceName, FrameTimingContext } from './FrameTimeSource';
import type { FrameTimes } from './FrameTimes';
import type { Seconds } from '../../../shared/units/time';
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
 * What can be known about the frame times before the track's timestamps are read: the answer,
 * or that the answer depends on them.
 */
export type FrameTimesPlan =
  | { readonly needsTrackTimestamps: false; readonly resolved: ResolvedFrameTimes | undefined }
  | {
      readonly needsTrackTimestamps: true;
      resolveWith(trackTimestamps: readonly Seconds[]): ResolvedFrameTimes | undefined;
    };

/**
 * Resolves what it can without the track's timestamps, which are costly to read, and asks for
 * them when the answer depends on them: their source comes, in the camera's order, before any
 * source that answers without them.
 */
export function planFrameTimes(
  context: Omit<FrameTimingContext, 'trackTimestamps'>,
  preferred: FrameTimeSourceName | undefined,
): FrameTimesPlan {
  const warnings: string[] = [];
  for (const source of orderFor(preferred)) {
    if (source.name === 'track-timestamps') {
      return {
        needsTrackTimestamps: true,
        resolveWith: (trackTimestamps) =>
          resolveFrameTimes({ ...context, trackTimestamps }, preferred),
      };
    }
    const frameTimes = source.resolve({ ...context, trackTimestamps: undefined });
    if (frameTimes) {
      return {
        needsTrackTimestamps: false,
        resolved: { frameTimes, source: source.name, warnings },
      };
    }
    warnings.push(`${source.name} unavailable`);
  }
  return { needsTrackTimestamps: false, resolved: undefined };
}

function orderFor(preferred: FrameTimeSourceName | undefined): readonly FrameTimeSource[] {
  return preferred === 'track-timestamps' ? TRACK_TIMESTAMPS_FIRST : EXPOSURE_FIRST;
}
