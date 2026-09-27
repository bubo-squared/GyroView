import type { FlipSteps } from './GyroSampleLayout';
import { VECTOR3_COMPONENTS } from '../../../../shared/math/Vector3';
import { GyroTrack, type GyroSample } from '../../../motion/gyro/GyroTrack';

/**
 * How closely the neighbours must agree, and the reading put back meet them, in parts of the
 * step (a sixteenth): looser than real motion curves over one interval and the sensor's noise,
 * tighter than a shock or a vibration would match a bit's weight by chance.
 */
const STEP_PARTS_TOLERATED = 16;

/**
 * The samples of a gyro record kept so far, in the columns a {@link GyroTrack} stores them in.
 */
export class SampleColumns {
  public length = 0;
  private readonly recordedTimes: Float64Array;
  private readonly accelerations: Float32Array;
  private readonly angularVelocities: Float32Array;

  public constructor(capacity: number) {
    this.recordedTimes = new Float64Array(capacity);
    this.accelerations = new Float32Array(capacity * VECTOR3_COMPONENTS);
    this.angularVelocities = new Float32Array(capacity * VECTOR3_COMPONENTS);
  }

  public push(sample: GyroSample): void {
    this.recordedTimes[this.length] = sample.captureTime;
    this.accelerations.set(sample.acceleration, this.length * VECTOR3_COMPONENTS);
    this.angularVelocities.set(sample.angularVelocity, this.length * VECTOR3_COMPONENTS);
    this.length += 1;
  }

  /**
   * Leaves out samples a flipped high bit moved: one component a bit's weight (one of `steps`)
   * from where its agreeing neighbours put it. A shock or a vibration leaps too, but between
   * neighbours that disagree, or by another amount. Compacts in place; each check reads only
   * samples not yet moved over.
   */
  public dropFlippedBits(steps: FlipSteps): void {
    let kept = 0;
    for (let index = 0; index < this.length; index += 1) {
      if (this.isFlippedAt(index, steps)) continue;
      this.moveSample(index, kept);
      kept += 1;
    }
    this.length = kept;
  }

  /**
   * The stamps as recorded, to be mended before they make a track.
   */
  public captureTimes(): Float64Array {
    return this.recordedTimes.subarray(0, this.length);
  }

  public toTrack(captureTimes: Float64Array): GyroTrack {
    const vectors = this.length * VECTOR3_COMPONENTS;
    return new GyroTrack(
      captureTimes,
      this.accelerations.subarray(0, vectors),
      this.angularVelocities.subarray(0, vectors),
    );
  }

  private isFlippedAt(index: number, steps: FlipSteps): boolean {
    const hasNeighbours = index > 0 && index < this.length - 1;
    return (
      hasNeighbours &&
      (hasFlippedComponent(this.accelerations, index, steps.acceleration) ||
        hasFlippedComponent(this.angularVelocities, index, steps.angularVelocity))
    );
  }

  private moveSample(from: number, to: number): void {
    if (from === to) return;
    this.recordedTimes[to] = this.recordedTimes[from] ?? 0;
    for (const vectors of [this.accelerations, this.angularVelocities]) {
      vectors.copyWithin(
        to * VECTOR3_COMPONENTS,
        from * VECTOR3_COMPONENTS,
        (from + 1) * VECTOR3_COMPONENTS,
      );
    }
  }
}

function hasFlippedComponent(
  vectors: Float32Array,
  index: number,
  steps: readonly number[],
): boolean {
  for (let axis = 0; axis < VECTOR3_COMPONENTS; axis += 1) {
    if (isFlippedComponent(vectors, index * VECTOR3_COMPONENTS + axis, steps)) return true;
  }
  return false;
}

/**
 * The component at `offset` lies one of `steps` from where its agreeing neighbours put it. Plain
 * loops, no closures: this runs for every component of every sample of an hour-long record.
 */
function isFlippedComponent(
  vectors: Float32Array,
  offset: number,
  steps: readonly number[],
): boolean {
  const before = vectors[offset - VECTOR3_COMPONENTS] ?? 0;
  const after = vectors[offset + VECTOR3_COMPONENTS] ?? 0;
  const leap = Math.abs((vectors[offset] ?? 0) - (before + after) / 2);
  const disagreement = Math.abs(before - after);
  for (const step of steps) {
    const tolerance = step / STEP_PARTS_TOLERATED;
    if (disagreement <= tolerance && Math.abs(leap - step) <= tolerance) return true;
  }
  return false;
}
