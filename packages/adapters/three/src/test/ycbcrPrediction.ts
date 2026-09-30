/**
 * What a texel holds when the upload of a decoded frame converts Y′CbCr and range and nothing
 * more: the prediction the upload probes hold the browser to (ADR 0033).
 */

/**
 * Limited range (BT.2100 table 9 for 10 bits, BT.709 for 8): where black sits, how far white is
 * above it, and chroma's centre and full excursion.
 */
export interface LimitedRange {
  readonly lumaBlack: number;
  readonly lumaExcursion: number;
  readonly chromaCentre: number;
  readonly chromaExcursion: number;
}

export const TEN_BIT_LIMITED: LimitedRange = {
  lumaBlack: 64,
  lumaExcursion: 876,
  chromaCentre: 512,
  chromaExcursion: 896,
};

export const EIGHT_BIT_LIMITED: LimitedRange = {
  lumaBlack: 16,
  lumaExcursion: 219,
  chromaCentre: 128,
  chromaExcursion: 224,
};

export interface YcbcrCodes {
  readonly y: number;
  readonly cb: number;
  readonly cr: number;
}

/**
 * A matrix's luma weights of red and blue.
 */
export interface LumaWeights {
  readonly kr: number;
  readonly kb: number;
}

/**
 * BT.2020's non-constant-luminance matrix, BT.709's, and BT.601's, the default a browser falls
 * back on for frames it takes for SD.
 */
export const BT2020_WEIGHTS: LumaWeights = { kr: 0.2627, kb: 0.0593 };
export const BT709_WEIGHTS: LumaWeights = { kr: 0.2126, kb: 0.0722 };
export const BT601_WEIGHTS: LumaWeights = { kr: 0.299, kb: 0.114 };

const CHANNEL_MAX = 255;

/**
 * R′G′B′ of limited-range codes through a matrix, in levels of 255.
 */
export function encodedRgbOf(
  codes: YcbcrCodes,
  range: LimitedRange,
  weights: LumaWeights,
): readonly number[] {
  const y = (codes.y - range.lumaBlack) / range.lumaExcursion;
  const pb = (codes.cb - range.chromaCentre) / range.chromaExcursion;
  const pr = (codes.cr - range.chromaCentre) / range.chromaExcursion;
  const red = y + 2 * (1 - weights.kr) * pr;
  const blue = y + 2 * (1 - weights.kb) * pb;
  const green = (y - weights.kr * red - weights.kb * blue) / (1 - weights.kr - weights.kb);
  return [red, green, blue].map((value) => Math.min(Math.max(value, 0), 1) * CHANNEL_MAX);
}

/**
 * The largest difference between two colours' channels.
 */
export function largestDifference(left: readonly number[], right: readonly number[]): number {
  return Math.max(...left.map((value, channel) => Math.abs(value - (right[channel] ?? NaN))));
}
