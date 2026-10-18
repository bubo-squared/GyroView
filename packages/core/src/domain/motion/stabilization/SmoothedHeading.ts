import type { OrientationTrack } from '../orientation/OrientationTrack';
import { rotateVector, type Quaternion } from '../../../shared/math/Quaternion';
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

/**
 * The camera's heading over a whole recording, smoothed both ways in time, so a steady turn is
 * followed without lag and a quick shake is averaged away.
 *
 * @remarks
 * The heading is the twist about the vertical horizon reads, `atan2(m13 - m31, m11 + m33)` of
 * the orientation's matrix, but averaged as that vector rather than as an angle. The vector's
 * length is how well the heading is defined: twice the cosine of half the camera's tilt from
 * upright, nothing where it has turned half over about a horizontal axis. Averaged as vectors,
 * the moments a skydiver's camera tumbles through that count for little, where an angle would
 * swing through a half turn at random and, unwrapped, leave a whole turn too many. Near the ends
 * the Gaussian is cut off and its weights taken in proportion.
 */
export class SmoothedHeading {
  private constructor(
    private readonly start: Seconds,
    private readonly sines: Float64Array,
    private readonly cosines: Float64Array,
  ) {}

  /**
   * Smooths the heading of the track's orientations with a Gaussian of standard deviation
   * `spread`; undefined for an empty track.
   */
  public static of(track: OrientationTrack, spread: Seconds): SmoothedHeading | undefined {
    const span = track.span;
    if (!span) return undefined;
    const count = Math.max(1, Math.floor((span.end - span.start) / GRID_STEP_SECONDS) + 1);
    const sines = new Float64Array(count);
    const cosines = new Float64Array(count);
    for (let index = 0; index < count; index += 1) {
      const [sine, cosine] = headingVectorOf(
        track.orientationAt(seconds(span.start + index * GRID_STEP_SECONDS)),
      );
      sines[index] = sine;
      cosines[index] = cosine;
    }
    const samples = spread / GRID_STEP_SECONDS;
    return new SmoothedHeading(
      span.start,
      gaussianOf(sines, samples),
      gaussianOf(cosines, samples),
    );
  }

  /**
   * The smoothed heading at a video time, interpolated on the grid and held at its ends.
   */
  public at(time: Seconds): Radians {
    const position = (time - this.start) / GRID_STEP_SECONDS;
    const last = this.sines.length - 1;
    const below = Math.min(Math.max(Math.floor(position), 0), last);
    const above = Math.min(below + 1, last);
    const fraction = Math.min(Math.max(position - below, 0), 1);
    const between = (values: Float64Array): number => {
      const low = values[below] ?? 0;
      return low + ((values[above] ?? low) - low) * fraction;
    };
    return radians(Math.atan2(between(this.sines), between(this.cosines)));
  }
}

/**
 * The twist about the vertical as a vector, its length how well the twist is defined.
 */
function headingVectorOf(orientation: Quaternion): [sine: number, cosine: number] {
  // The frame's x and z axes in the world: the matrix's first and third columns.
  const [xx, , xz] = rotateVector(orientation, [1, 0, 0]);
  const [zx, , zz] = rotateVector(orientation, [0, 0, 1]);
  return [zx - xz, xx + zz];
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
