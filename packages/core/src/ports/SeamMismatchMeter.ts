import type { SeamBinCosts } from '../domain/stitching/seamMismatch';
import type { Matrix3 } from '../shared/math/Matrix3';
import type { Vector3 } from '../shared/math/Vector3';

/**
 * Candidate poses of one lens to measure against the other, over the frames on screen.
 */
export interface SeamMismatchRequest {
  /**
   * The lens whose body-to-lens rotation each candidate replaces; the other lens keeps its own.
   */
  readonly lensIndex: number;
  readonly rotations: readonly Matrix3[];
  /**
   * Per-channel gains applied to each lens before their lumas are compared, one per lens in
   * lens order: the exposure matching the picture applies, so the cost is alignment alone.
   */
  readonly gains: readonly Vector3[];
}

/**
 * Port: measures how the two lenses disagree along the seam strip of the frames on screen, one
 * cost per bin per candidate rotation in request order; undefined when the picture could not
 * be read back this time.
 */
export interface SeamMismatchMeter {
  measure(request: SeamMismatchRequest): Promise<readonly SeamBinCosts[] | undefined>;
  dispose(): void;
}
