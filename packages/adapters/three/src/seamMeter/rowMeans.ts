import type { Vector3 } from '@gyroview/core';

/**
 * Channels per pixel in the RGBA8 images read back from the GPU.
 */
export const RGBA_CHANNELS = 4;
const CHANNEL_MAX = 255;
const ALPHA = 3;
/**
 * A channel at or above this level (of 255) is blown out, or nearly: the lens's exposure no
 * longer scales it, so its ratio to the other lens says nothing about their exposures.
 */
const BLOWN_OUT_LEVEL = 250;

/**
 * Mean RGB (0..1) of each row of an RGBA8 image, one row per lens and one column per direction
 * along the seam, over the directions every row images (non-zero alpha) and none shows blown out:
 * only there do the lenses' colours differ by their exposures. Undefined when no such direction
 * is left, because then there is nothing to match.
 */
export function rowMeansOf(
  pixels: Uint8Array,
  width: number,
  rowCount: number,
): readonly Vector3[] | undefined {
  const rows = Array.from({ length: rowCount }, (_, row) =>
    pixels.subarray(row * width * RGBA_CHANNELS, (row + 1) * width * RGBA_CHANNELS),
  );
  const columns = Array.from({ length: width }, (_, column) => column * RGBA_CHANNELS).filter(
    (offset) => rows.every((row) => isComparable(row, offset)),
  );
  return columns.length === 0 ? undefined : rows.map((row) => meanOf(row, columns));
}

function isComparable(row: Uint8Array, offset: number): boolean {
  const texel = row.subarray(offset, offset + RGBA_CHANNELS);
  return (
    (texel[ALPHA] ?? 0) !== 0 &&
    texel.subarray(0, ALPHA).every((channel) => channel < BLOWN_OUT_LEVEL)
  );
}

function meanOf(row: Uint8Array, columns: readonly number[]): Vector3 {
  const sum: [number, number, number] = [0, 0, 0];
  for (const offset of columns) {
    sum[0] += row[offset] ?? 0;
    sum[1] += row[offset + 1] ?? 0;
    sum[2] += row[offset + 2] ?? 0;
  }
  const scale = columns.length * CHANNEL_MAX;
  return [sum[0] / scale, sum[1] / scale, sum[2] / scale];
}
