import type { MeiDistortion } from './MeiDistortion';
import type { PixelPoint } from './PixelPoint';
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
      readonly distortion: MeiDistortion;
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
 * How a lens maps viewing directions to pixels of the calibration canvas. Each Insta360
 * calibration string version carries a different model; each builds the parameters of one of the
 * two projections, which `projectDirection` evaluates on the CPU as the shader does on the GPU.
 */
export interface LensModel {
  readonly kind: LensModelKind;
  readonly principalPoint: PixelPoint;
  /**
   * Angle from the optical axis beyond which the lens sees nothing.
   */
  readonly halfFieldOfView: Radians;
  readonly projection: LensProjectionParameters;
}
