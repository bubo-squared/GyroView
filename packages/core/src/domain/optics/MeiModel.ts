import type { LensModel, LensProjectionParameters } from './LensModel';
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
  readonly radial: readonly [k1: number, k2: number, k3: number];
  readonly tangential: readonly [p1: number, p2: number];
}

/**
 * Unified (Mei) omnidirectional camera model with radial-tangential distortion, as stored in
 * `offset_v3`. A direction is projected onto the unit sphere, then from a point `xi` behind the
 * sphere centre onto the normalised image plane, then distorted and scaled.
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
    const normalised: readonly [number, number] = [x / depth, y / depth];
    const [distortedX, distortedY] = this.distort(normalised);
    return {
      x: this.parameters.focal[0] * distortedX + this.principalPoint.x,
      y: this.parameters.focal[1] * distortedY + this.principalPoint.y,
    };
  }

  private distort([mx, my]: readonly [number, number]): readonly [number, number] {
    const [k1, k2, k3] = this.parameters.radial;
    const [p1, p2] = this.parameters.tangential;
    const r2 = mx * mx + my * my;
    const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
    const tangentialX = 2 * p1 * mx * my + p2 * (r2 + 2 * mx * mx);
    const tangentialY = p1 * (r2 + 2 * my * my) + 2 * p2 * mx * my;
    return [radial * mx + tangentialX, radial * my + tangentialY];
  }
}
