import type { SeamBinCosts } from '../domain/stitching/seamMismatch';
import type { StripShift } from '../domain/stitching/seamStrip';
import type { Matrix3 } from '../shared/math/Matrix3';
import type { Vector3 } from '../shared/math/Vector3';

/**
 * What the candidates replace for the candidate lens: its whole body-to-lens rotation, or
 * only where along and across the ring it is sampled, the rotation left as it is.
 */
export type SeamCandidates =
  | { readonly kind: 'rotations'; readonly rotations: readonly Matrix3[] }
  | { readonly kind: 'shifts'; readonly shifts: readonly StripShift[] };

/**
 * Candidates for one lens to measure against the other, over the frames on screen.
 */
export interface SeamMismatchRequest {
  /**
   * The lens the candidates apply to; the other lens keeps its own pose and sampling.
   */
  readonly lensIndex: number;
  readonly candidates: SeamCandidates;
  /**
   * Per-channel gains applied to each lens before their lumas are compared, one per lens in
   * lens order: the exposure matching the picture applies, so the cost is alignment alone.
   */
  readonly gains: readonly Vector3[];
}

/**
 * Port: measures how the two lenses disagree along the seam strip of the frames on screen, one
 * cost per bin per candidate in request order; undefined when the picture could not be read
 * back this time.
 */
export interface SeamMismatchMeter {
  measure(request: SeamMismatchRequest): Promise<readonly SeamBinCosts[] | undefined>;
  dispose(): void;
}
