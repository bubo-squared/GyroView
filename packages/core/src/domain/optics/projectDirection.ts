import type { LensModel, LensProjectionParameters } from './LensModel';
import type { PixelPoint } from './PixelPoint';
import { distortMei } from './MeiDistortion';
import type { Vector3 } from '../../shared/math/Vector3';

/**
 * What projecting through a lens takes: its projection's parameters and the angle from the
 * optical axis beyond which it sees nothing. A lens model, or a stitching setup's lens drawn at
 * the calibration's radial scale.
 */
export type ProjectingLens = Pick<LensModel, 'projection' | 'halfFieldOfView'>;

type MeiProjection = Extract<LensProjectionParameters, { kind: 'mei' }>;
type RadialProjection = Extract<LensProjectionParameters, { kind: 'radial-polynomial' }>;

/**
 * Maps a viewing direction in the lens frame (x right, y down, z along the optical axis, unit
 * length) to a pixel on the calibration canvas, as the shader evaluates the same parameters: the
 * domain's reference, against which the calibration parsers and the renderer's shader are
 * checked. Undefined when the direction cannot be imaged (behind the lens or outside its field).
 */
export function projectDirection(lens: ProjectingLens, direction: Vector3): PixelPoint | undefined {
  if (angleFromAxis(direction) > lens.halfFieldOfView) return undefined;
  const { projection } = lens;
  switch (projection.kind) {
    case 'mei': {
      return meiPixel(projection, direction);
    }
    case 'radial-polynomial': {
      return radialPixel(projection, direction);
    }
  }
}

function angleFromAxis([x, y, z]: Vector3): number {
  return Math.atan2(Math.hypot(x, y), z);
}

/**
 * Onto the unit sphere, then from a point `xi` behind its centre onto the normalised image plane,
 * distorted and scaled; nothing where the direction lies behind that point.
 */
function meiPixel(projection: MeiProjection, [x, y, z]: Vector3): PixelPoint | undefined {
  const depth = z + projection.xi;
  if (depth <= 0) return undefined;
  const [distortedX, distortedY] = distortMei(projection.distortion, [x / depth, y / depth]);
  return {
    x: projection.focal[0] * distortedX + projection.principalPoint.x,
    y: projection.focal[1] * distortedY + projection.principalPoint.y,
  };
}

/**
 * The image radius a polynomial in the angle from the axis gives, along the direction's azimuth.
 */
function radialPixel(projection: RadialProjection, direction: Vector3): PixelPoint {
  const [x, y] = direction;
  const theta = angleFromAxis(direction);
  const [c1, c2, c3, c4] = projection.coefficients;
  const radius = theta * (c1 + theta * (c2 + theta * (c3 + theta * c4)));
  const lateral = Math.hypot(x, y);
  const [unitX, unitY] = lateral === 0 ? [0, 0] : [x / lateral, y / lateral];
  return {
    x: projection.principalPoint.x + radius * unitX,
    y: projection.principalPoint.y + radius * unitY,
  };
}
