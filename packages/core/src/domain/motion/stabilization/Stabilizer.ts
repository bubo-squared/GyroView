import type { Matrix3 } from '../../../shared/math/Matrix3';
import type { Quaternion } from '../../../shared/math/Quaternion';
import type { Seconds } from '../../../shared/units/time';

export type StabilizationMode = 'off' | 'lock' | 'horizon' | 'follow';

/**
 * Strategy: turns the camera's orientation at a frame into the rotation the renderer applies
 * between the viewer's direction and the camera body, so that the picture holds still the way
 * the mode wants. Stateful modes (follow) remember previous frames.
 */
export interface Stabilizer {
  readonly mode: StabilizationMode;
  /**
   * The view-to-body rotation for a frame captured with the body at `orientation` (body to
   * world) at `videoTime`.
   */
  rotationFor(orientation: Quaternion, videoTime: Seconds): Matrix3;
}
