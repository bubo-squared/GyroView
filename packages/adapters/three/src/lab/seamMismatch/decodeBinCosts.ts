import { MISMATCH_CAP, SEAM_BIN_COUNT, type SeamBinCost, type SeamBinCosts } from '@gyroview/core';

import { RGBA_CHANNELS } from '../../seamMeter/rowMeans';

/**
 * The mismatch travels as a 16-bit code in two 8-bit channels; the mismatch shader encodes it with
 * these, as preprocessor defines.
 */
const CHANNEL_MAX = 255;
const BYTE_VALUES = 256;
const CODE_MAX = 65_535;

export const MISMATCH_ENCODING_DEFINES: readonly (readonly [string, number])[] = [
  ['MISMATCH_CHANNEL_MAX', CHANNEL_MAX],
  ['MISMATCH_BYTE_VALUES', BYTE_VALUES],
  ['MISMATCH_CODE_MAX', CODE_MAX],
];

/**
 * The bin costs of each slide from the rows the mismatch program wrote, in slide order: the
 * mismatch's two bytes (a share of the cap) in red and green, the validity in blue.
 */
export function decodeBinCosts(pixels: Uint8Array, slideCount: number): SeamBinCosts[] {
  return Array.from({ length: slideCount }, (_unused, slide) =>
    Array.from({ length: SEAM_BIN_COUNT }, (_alsoUnused, bin) =>
      binCostAt(pixels, (slide * SEAM_BIN_COUNT + bin) * RGBA_CHANNELS),
    ),
  );
}

function binCostAt(pixels: Uint8Array, offset: number): SeamBinCost {
  const code = (pixels[offset] ?? 0) * BYTE_VALUES + (pixels[offset + 1] ?? 0);
  return {
    mismatch: (code / CODE_MAX) * MISMATCH_CAP,
    validity: (pixels[offset + 2] ?? 0) / CHANNEL_MAX,
  };
}
