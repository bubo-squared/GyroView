import type { SeamBinCosts } from '../domain/stitching/seamMismatch';
import type { Vector3 } from '../shared/math/Vector3';
import type { Degrees } from '../shared/units/angle';

/**
 * Slides of lens 0's sampling of the seam strip across the ring, each measured against lens 1
 * over the frames on screen.
 */
export interface SeamMismatchRequest {
  readonly disparities: readonly Degrees[];
  /**
   * Per-channel gains applied to each lens before their lumas are compared, one per lens in
   * lens order: the exposure matching the picture applies, so the cost is alignment alone.
   */
  readonly gains: readonly Vector3[];
}

/**
 * Port: measures how the two lenses disagree along the seam strip of the frames on screen, one
 * cost per bin per slide in request order; undefined when the picture could not be read back
 * this time.
 */
export interface SeamMismatchMeter {
  measure(request: SeamMismatchRequest): Promise<readonly SeamBinCosts[] | undefined>;
  dispose(): void;
}
