import type { LensModel, LensProjectionParameters } from './LensModel';
import { distortMei, type MeiDistortion } from './MeiDistortion';
import type { PixelPoint } from './PixelPoint';
import type { Vector3 } from '../../shared/math/Vector3';
import { HALF_FIELD_OF_VIEW } from './opticsConstants';

export interface MeiParameters {
  /**
   * Distance of the projection centre behind the unit sphere's centre; 2.0 on X5 lenses.
   */
  readonly xi: number;
  readonly focal: readonly [fx: number, fy: number];
  readonly principalPoint: PixelPoint;
  readonly distortion: MeiDistortion;
}

/**
 * Unified (Mei) omnidirectional camera model with radial, tangential and thin-prism distortion,
 * as stored in `offset_v3`. A direction is projected onto the unit sphere, then from a point
 * `xi` behind the sphere centre onto the normalised image plane, then distorted and scaled.
 */
export class MeiModel implements LensModel {
  public readonly kind = 'mei';
  public readonly halfFieldOfView = HALF_FIELD_OF_VIEW;
  public readonly principalPoint: PixelPoint;

  public constructor(private readonly parameters: MeiParameters) {
    this.principalPoint = parameters.principalPoint;
  }

  public get projection(): LensProjectionParameters {
    return { kind: 'mei', ...this.parameters };
  }

  public project(direction: Vector3): PixelPoint | undefined {
    const [x, y, z] = direction;
    const depth = z + this.parameters.xi;
    if (depth <= 0 || Math.atan2(Math.hypot(x, y), z) > this.halfFieldOfView) return undefined;
    const [distortedX, distortedY] = distortMei(this.parameters.distortion, [x / depth, y / depth]);
    return {
      x: this.parameters.focal[0] * distortedX + this.principalPoint.x,
      y: this.parameters.focal[1] * distortedY + this.principalPoint.y,
    };
  }
}
