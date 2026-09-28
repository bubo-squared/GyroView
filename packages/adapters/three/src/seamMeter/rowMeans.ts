import type { Vector3 } from '@gyroview/core';

/**
 * Channels per pixel in the RGBA8 images read back from the GPU.
 */
export const RGBA_CHANNELS = 4;
const CHANNEL_MAX = 255;

/**
 * Mean RGB (0..1) of the texels with non-zero alpha in each row of an RGBA8 image; undefined
 * when some row has none, because a lens that images no part of the seam gives nothing to match.
 */
export function rowMeansOf(
  pixels: Uint8Array,
  width: number,
  rowCount: number,
): readonly Vector3[] | undefined {
  const means: Vector3[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const mean = rowMean(
      pixels.subarray(row * width * RGBA_CHANNELS, (row + 1) * width * RGBA_CHANNELS),
    );
    if (!mean) return undefined;
    means.push(mean);
  }
  return means;
}

function rowMean(row: Uint8Array): Vector3 | undefined {
  const sum: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (let offset = 0; offset + RGBA_CHANNELS <= row.length; offset += RGBA_CHANNELS) {
    if ((row[offset + RGBA_CHANNELS - 1] ?? 0) === 0) continue;
    sum[0] += row[offset] ?? 0;
    sum[1] += row[offset + 1] ?? 0;
    sum[2] += row[offset + 2] ?? 0;
    count += 1;
  }
  if (count === 0) return undefined;
  const scale = count * CHANNEL_MAX;
  return [sum[0] / scale, sum[1] / scale, sum[2] / scale];
}
