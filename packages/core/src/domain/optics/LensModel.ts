import type { PixelPoint } from './PixelPoint';
import type { Vector3 } from '../../shared/math/Vector3';
import type { Radians } from '../../shared/units/angle';

export type LensModelKind = 'mei' | 'polynomial' | 'equidistant';

/**
 * The projection in the two forms a renderer evaluates on the GPU: the unified (Mei) model, or
 * a radial polynomial in the angle from the optical axis that covers both the `offset_v2`
 * polynomial and the equidistant fallback.
 */
export type LensProjectionParameters =
  | {
      readonly kind: 'mei';
      readonly xi: number;
      readonly focal: readonly [fx: number, fy: number];
      readonly principalPoint: PixelPoint;
      readonly radial: readonly [k1: number, k2: number, k3: number];
      readonly tangential: readonly [p1: number, p2: number];
    }
  | {
      readonly kind: 'radial-polynomial';
      readonly principalPoint: PixelPoint;
      /**
       * Image radius in canvas pixels: `c1*t + c2*t^2 + c3*t^3 + c4*t^4`, `t` in radians.
       */
      readonly coefficients: readonly [c1: number, c2: number, c3: number, c4: number];
    };

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
   * The same projection as {@link project}, as parameters for a shader.
   */
  readonly projection: LensProjectionParameters;
  /**
   * Undefined when the direction cannot be imaged (behind the lens or outside its field).
   */
  project(direction: Vector3): PixelPoint | undefined;
}
