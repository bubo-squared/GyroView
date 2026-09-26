import { pixelAtRadius, toPolar } from './lensGeometry';
import type { LensModel, LensProjectionParameters } from './LensModel';
import type { PixelPoint } from './PixelPoint';
import type { Vector3 } from '../../shared/math/Vector3';
import { HALF_FIELD_OF_VIEW } from './opticsConstants';

export interface PolynomialParameters {
  /**
   * Image radius at the field edge, in pixels.
   */
  readonly edgeRadius: number;
  readonly principalPoint: PixelPoint;
  /**
   * `c1..c4` of `offset_v2`, applied as c1*t + c2*t^2 + c3*t^3 + c4*t^4 with t in radians.
   */
  readonly coefficients: readonly [c1: number, c2: number, c3: number, c4: number];
}

/**
 * Polynomial fisheye model of `offset_v2`. Insta360 does not document the normalisation; on the
 * X5 lenses, evaluating the polynomial in radians and scaling it so that the field edge maps to
 * `edgeRadius` reproduces the MEI model within 9 px, so that is the working interpretation until
 * a recording that carries only `offset_v2` can confirm it.
 */
export class PolynomialModel implements LensModel {
  public readonly kind = 'polynomial';
  public readonly halfFieldOfView = HALF_FIELD_OF_VIEW;
  public readonly principalPoint: PixelPoint;
  private readonly scale: number;

  public constructor(private readonly parameters: PolynomialParameters) {
    this.principalPoint = parameters.principalPoint;
    this.scale = parameters.edgeRadius / this.polynomial(this.halfFieldOfView);
  }

  public get projection(): LensProjectionParameters {
    const [c1, c2, c3, c4] = this.parameters.coefficients;
    return {
      kind: 'radial-polynomial',
      principalPoint: this.principalPoint,
      coefficients: [c1 * this.scale, c2 * this.scale, c3 * this.scale, c4 * this.scale],
    };
  }

  public project(direction: Vector3): PixelPoint | undefined {
    const { theta, radialUnit } = toPolar(direction);
    return theta > this.halfFieldOfView
      ? undefined
      : pixelAtRadius(this.principalPoint, this.scale * this.polynomial(theta), radialUnit);
  }

  private polynomial(theta: number): number {
    const [c1, c2, c3, c4] = this.parameters.coefficients;
    return theta * (c1 + theta * (c2 + theta * (c3 + theta * c4)));
  }
}
