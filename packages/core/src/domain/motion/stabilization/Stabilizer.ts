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
   * The rotation from the view into the camera's upright frame for the next presented frame,
   * captured with that frame at `orientation` (upright frame to world) at `videoTime`; the
   * mounting carries it on into the body (ADR 0038). A stateful mode moves its filter to that
   * frame, so it is asked once per presented frame.
   */
  nextRotation(orientation: Quaternion, videoTime: Seconds): Matrix3;
}
