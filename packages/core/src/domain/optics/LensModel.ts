import type { PixelPoint } from './PixelPoint';
import type { Vector3 } from '../../shared/math/Vector3';
import type { Radians } from '../../shared/units/angle';

export type LensModelKind = 'mei' | 'polynomial' | 'equidistant';

/**
 * Maps a viewing direction in the lens frame (x right, y down, z along the optical axis, unit
 * length) to a pixel on the calibration canvas. Each Insta360 calibration string version carries
 * a different model; the renderer treats them uniformly.
 */
export interface LensModel {
  readonly kind: LensModelKind;
  readonly principalPoint: PixelPoint;
  /**
   * Angle from the optical axis beyond which the lens sees nothing.
   */
  readonly halfFieldOfView: Radians;
  /**
   * Undefined when the direction cannot be imaged (behind the lens or outside its field).
   */
  project(direction: Vector3): PixelPoint | undefined;
}
