import type { Matrix3 } from '../../../shared/math/Matrix3';
import type { Quaternion } from '../../../shared/math/Quaternion';
import type { Seconds } from '../../../shared/units/time';

export type StabilizationMode = 'off' | 'lock' | 'horizon' | 'follow';

export const STABILIZATION_MODES: readonly StabilizationMode[] = [
  'off',
  'lock',
  'horizon',
  'follow',
];

/**
 * The world stays put: the most useful default for a camera carried around.
 */
export const DEFAULT_STABILIZATION_MODE: StabilizationMode = 'lock';

/**
 * Strategy: turns the camera's orientation at a frame into the rotation the renderer applies
 * between the viewer's direction and the camera body, so that the picture holds still the way
 * the mode wants. Stateful modes (follow) remember previous frames.
 */
export interface Stabilizer {
  /**
   * The view-to-body rotation for the next presented frame, captured with the body at
   * `orientation` (body to world) at `videoTime`. A stateful mode moves its filter to that frame,
   * so it is asked once per presented frame.
   */
  nextRotation(orientation: Quaternion, videoTime: Seconds): Matrix3;
}
