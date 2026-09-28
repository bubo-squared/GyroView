import { pixelAtRadius, toPolar } from './lensGeometry';
import type { LensModel, LensProjectionParameters } from './LensModel';
import type { PixelPoint } from './PixelPoint';
import type { Vector3 } from '../../shared/math/Vector3';
import type { Radians } from '../../shared/units/angle';
import { HALF_FIELD_OF_VIEW } from './opticsConstants';

export interface EquidistantParameters {
  /**
   * The radius, in canvas pixels, of the direction `radiusAngle` from the axis.
   */
  readonly edgeRadius: number;
  readonly radiusAngle: Radians;
  readonly principalPoint: PixelPoint;
}

/**
 * Ideal equidistant fisheye (`r = f * theta`) implied by the legacy `offset` string, which stores
 * only a radius and the centre per lens. The reading Insta360's own stitch agrees with on the
 * far field (ADR 0023), so the default; directions past the field edge are refused.
 */
export class EquidistantModel implements LensModel {
  public readonly kind = 'equidistant';
  public readonly halfFieldOfView = HALF_FIELD_OF_VIEW;
  public readonly principalPoint: PixelPoint;

  public constructor(private readonly parameters: EquidistantParameters) {
    this.principalPoint = parameters.principalPoint;
  }

  public get projection(): LensProjectionParameters {
    return {
      kind: 'radial-polynomial',
      principalPoint: this.principalPoint,
      coefficients: [this.pixelsPerRadian, 0, 0, 0],
    };
  }

  public project(direction: Vector3): PixelPoint | undefined {
    const { theta, radialUnit } = toPolar(direction);
    return theta > this.halfFieldOfView
      ? undefined
      : pixelAtRadius(this.principalPoint, this.pixelsPerRadian * theta, radialUnit);
  }

  private get pixelsPerRadian(): number {
    return this.parameters.edgeRadius / this.parameters.radiusAngle;
  }
}
