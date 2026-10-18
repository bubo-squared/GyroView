import type { OrientationTrack } from '../orientation/OrientationTrack';
import { radians, type Radians } from '../../../shared/units/angle';
import { seconds, type Seconds } from '../../../shared/units/time';

/**
 * The step of the grid the heading is smoothed on: far finer than any turn the smoothing keeps.
 */
const GRID_STEP_SECONDS = 0.01;
/**
 * The Gaussian's reach, in standard deviations: what lies further weighs under one percent of
 * one percent.
 */
const KERNEL_REACH = 3;
const FULL_TURN = 2 * Math.PI;

/**
 * The camera's heading over a whole recording, smoothed both ways in time: a Gaussian over the
 * unwrapped heading on a regular grid, so a steady turn is followed without lag and a quick shake
 * is averaged away. Near the ends the Gaussian is cut off and its weights taken in proportion.
 */
export class SmoothedHeading {
  private constructor(
    private readonly start: Seconds,
    private readonly headings: Float64Array,
  ) {}

  /**
   * Smooths the heading `headingOf` reads from the track's orientations with a Gaussian of
   * standard deviation `spread`.
   */
  public static of(
    track: OrientationTrack,
    headingOf: (orientation: ReturnType<OrientationTrack['orientationAt']>) => Radians,
    spread: Seconds,
  ): SmoothedHeading | undefined {
    const span = track.span;
    if (!span) return undefined;
    const count = Math.max(1, Math.floor((span.end - span.start) / GRID_STEP_SECONDS) + 1);
    const unwrapped = new Float64Array(count);
    let previous = 0;
    for (let index = 0; index < count; index += 1) {
      const time = seconds(span.start + index * GRID_STEP_SECONDS);
      const heading = headingOf(track.orientationAt(time));
      // The heading wraps at a half turn; the unwrapped one carries on, a turn past the last.
      const turns = index === 0 ? 0 : Math.round((previous - heading) / FULL_TURN);
      previous = heading + turns * FULL_TURN;
      unwrapped[index] = previous;
    }
    return new SmoothedHeading(span.start, gaussianOf(unwrapped, spread / GRID_STEP_SECONDS));
  }

  /**
   * The smoothed heading at a video time, interpolated on the grid and held at its ends.
   */
  public at(time: Seconds): Radians {
    const position = (time - this.start) / GRID_STEP_SECONDS;
    const last = this.headings.length - 1;
    const below = Math.min(Math.max(Math.floor(position), 0), last);
    const above = Math.min(below + 1, last);
    const fraction = Math.min(Math.max(position - below, 0), 1);
    const low = this.headings[below] ?? 0;
    const high = this.headings[above] ?? low;
    return radians(low + (high - low) * fraction);
  }
}

/**
 * The values smoothed by a Gaussian of `spread` samples, cut off at its reach and renormalized
 * where the ends cut it shorter.
 */
function gaussianOf(values: Float64Array, spread: number): Float64Array {
  const reach = Math.ceil(spread * KERNEL_REACH);
  const weights = Float64Array.from({ length: reach + 1 }, (_, offset) =>
    Math.exp(-(offset * offset) / (2 * spread * spread)),
  );
  const smoothed = new Float64Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    let sum = 0;
    let weightSum = 0;
    const from = Math.max(0, index - reach);
    const to = Math.min(values.length - 1, index + reach);
    for (let other = from; other <= to; other += 1) {
      const weight = weights[Math.abs(other - index)] ?? 0;
      sum += weight * (values[other] ?? 0);
      weightSum += weight;
    }
    smoothed[index] = sum / weightSum;
  }
  return smoothed;
}
