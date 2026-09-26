import { pixelAtRadius, toPolar } from './lensGeometry';
import type { LensModel, LensProjectionParameters } from './LensModel';
import type { PixelPoint } from './PixelPoint';
import type { Vector3 } from '../../shared/math/Vector3';
import { HALF_FIELD_OF_VIEW } from './opticsConstants';

export interface EquidistantParameters {
  readonly edgeRadius: number;
  readonly principalPoint: PixelPoint;
}

/**
 * Ideal equidistant fisheye (`r = f * theta`) implied by the legacy `offset` string, which stores
 * only the field-edge radius and centre per lens. Deviates from the true X5 lens by up to ~50 px
 * mid-field, so it is the fallback of last resort.
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
      coefficients: [this.parameters.edgeRadius / this.halfFieldOfView, 0, 0, 0],
    };
  }

  public project(direction: Vector3): PixelPoint | undefined {
    const { theta, radialUnit } = toPolar(direction);
    const radius = (this.parameters.edgeRadius * theta) / this.halfFieldOfView;
    return theta > this.halfFieldOfView
      ? undefined
      : pixelAtRadius(this.principalPoint, radius, radialUnit);
  }
}
