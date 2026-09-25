import type { Vector3 } from '../../shared/math/Vector3';

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

/**
 * A full turn across for a half turn from top to bottom.
 */
export const EQUIRECTANGULAR_ASPECT = 2;

const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;
const PIXEL_CENTRE = 0.5;

/**
 * Where a direction (in the frame the image is drawn in: x right, y down, z forward) lands in an
 * equirectangular image: yaw across the width from -180 to 180 degrees, pitch down the height
 * from +90 to -90. The inverse of the ray the stitching shader casts.
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

/**
 * The unit direction seen through the centre of a pixel.
 */
export function equirectangularDirectionOf(pixel: EquirectangularPixel, size: PixelSize): Vector3 {
  const yaw = (((pixel.column + PIXEL_CENTRE) / size.width) * 2 - 1) * HALF_TURN;
  const pitch = (1 - ((pixel.row + PIXEL_CENTRE) / size.height) * 2) * QUARTER_TURN;
  return [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}
