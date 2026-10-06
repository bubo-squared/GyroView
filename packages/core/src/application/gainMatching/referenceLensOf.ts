import { openingDirectionOf, type Mounting } from '../../domain/motion/mounting/Mounting';
import { opticalAxisOf } from '../../domain/optics/lensPose';
import type { LensStitch } from '../../domain/stitching/StitchingSetup';
import { indexOfLeast } from '../../shared/math/minimum';
import { dotProduct } from '../../shared/math/Vector3';

/**
 * The lens gain matching holds the others to: the one whose optical axis lies nearest the
 * direction the view opens facing, so the exposure of the view the viewer starts on stays as
 * recorded (ADR 0012). Where the view opens across both lenses, as on a lens-vertical camera,
 * either would serve. Counted by its place among the setup's lenses, as the seam meter and the
 * gains are.
 */
export function referenceLensOf(
  lenses: readonly Pick<LensStitch, 'rotation'>[],
  mounting: Mounting,
): number {
  const opening = openingDirectionOf(mounting);
  return indexOfLeast(lenses.map((lens) => -dotProduct(opticalAxisOf(lens.rotation), opening)));
}
