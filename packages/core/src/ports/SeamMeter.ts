import type { Vector3 } from '../shared/math/Vector3';

/**
 * Port: measures what each lens shows along the seam of the frames on screen, as a mean colour
 * (0..1 per channel) per lens in lens order; undefined when a lens images none of the seam or the
 * picture could not be read back this time.
 */
export interface SeamMeter {
  measure(): Promise<readonly Vector3[] | undefined>;
  dispose(): void;
}
