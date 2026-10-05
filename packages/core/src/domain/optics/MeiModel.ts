import type { LensModel, LensProjectionParameters } from './LensModel';
import { ensureWithinTermCapacity, type MeiDistortion } from './MeiDistortion';
import type { PixelPoint } from './PixelPoint';
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
 * as stored in `offset_v3` and `offset_v6`. A direction is projected onto the unit sphere, then from a point
 * `xi` behind the sphere centre onto the normalised image plane, then distorted and scaled.
 */
export class MeiModel implements LensModel {
  public readonly kind = 'mei';
  public readonly halfFieldOfView = HALF_FIELD_OF_VIEW;
  public readonly principalPoint: PixelPoint;

  public constructor(private readonly parameters: MeiParameters) {
    ensureWithinTermCapacity(parameters.distortion);
    this.principalPoint = parameters.principalPoint;
  }

  public get projection(): LensProjectionParameters {
    return { kind: 'mei', ...this.parameters };
  }
}
