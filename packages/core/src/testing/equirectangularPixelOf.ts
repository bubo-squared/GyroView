import type { Vector3 } from '../shared/math/Vector3';

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A pixel of an equirectangular image, row counted from the top.
 */
export interface EquirectangularPixel {
  readonly column: number;
  readonly row: number;
}

const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;

/**
 * Where a direction (in the frame the image is drawn in: x right, y down, z forward) lands in an
 * equirectangular image: yaw across the width from -180 to 180 degrees, pitch down the height
 * from +90 to -90. The inverse of the ray the stitching shader casts, which makes it the oracle
 * the renderer's tests read panoramas with.
 */
export function equirectangularPixelOf(direction: Vector3, size: PixelSize): EquirectangularPixel {
  const [x, y, z] = direction;
  const yaw = Math.atan2(x, z);
  const sine = Math.max(-1, Math.min(1, -y / Math.hypot(x, y, z)));
  const pitch = Math.asin(sine);
  return {
    column: Math.min(size.width - 1, Math.floor(((yaw / HALF_TURN + 1) / 2) * size.width)),
    row: Math.min(size.height - 1, Math.floor(((1 - pitch / QUARTER_TURN) / 2) * size.height)),
  };
}
