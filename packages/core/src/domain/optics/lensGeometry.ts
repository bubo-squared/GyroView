import type { PixelPoint } from './PixelPoint';
import type { Vector3 } from '../../shared/math/Vector3';
import type { Radians } from '../../shared/units/angle';

/**
 * Polar decomposition of a unit direction in the lens frame: the angle from the optical axis and
 * the unit vector pointing from the principal point towards the image of the direction.
 */
export interface PolarDirection {
  readonly theta: Radians;
  readonly radialUnit: readonly [x: number, y: number];
}

export function toPolar(direction: Vector3): PolarDirection {
  const [x, y, z] = direction;
  const lateral = Math.hypot(x, y);
  const theta = Math.atan2(lateral, z) as Radians;
  const radialUnit: readonly [number, number] = lateral === 0 ? [0, 0] : [x / lateral, y / lateral];
  return { theta, radialUnit };
}

export function pixelAtRadius(
  principalPoint: PixelPoint,
  radius: number,
  radialUnit: readonly [x: number, y: number],
): PixelPoint {
  return {
    x: principalPoint.x + radius * radialUnit[0],
    y: principalPoint.y + radius * radialUnit[1],
  };
}
