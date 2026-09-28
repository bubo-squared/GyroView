import { MISMATCH_CAP, SEAM_BIN_COUNT, type SeamBinCost, type SeamBinCosts } from '@gyroview/core';

import { RGBA_CHANNELS } from '../seamMeter/rowMeans';

const CHANNEL_MAX = 255;
const BYTE = 256;
const CODE_MAX = 65_535;

/**
 * The bin costs of each candidate from the rows the mismatch program wrote, in candidate order:
 * the mismatch's two bytes (a share of the cap) in red and green, the validity in blue.
 */
export function decodeBinCosts(pixels: Uint8Array, candidateCount: number): SeamBinCosts[] {
  return Array.from({ length: candidateCount }, (_unused, candidate) =>
    Array.from({ length: SEAM_BIN_COUNT }, (_alsoUnused, bin) =>
      binCostAt(pixels, (candidate * SEAM_BIN_COUNT + bin) * RGBA_CHANNELS),
    ),
  );
}

function binCostAt(pixels: Uint8Array, offset: number): SeamBinCost {
  const code = (pixels[offset] ?? 0) * BYTE + (pixels[offset + 1] ?? 0);
  return {
    mismatch: (code / CODE_MAX) * MISMATCH_CAP,
    validity: (pixels[offset + 2] ?? 0) / CHANNEL_MAX,
  };
}
