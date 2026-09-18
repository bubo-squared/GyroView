import type { CalibrationSet } from './LensCalibration';
import { type CalibrationStringLayout, type LensBlock } from './layouts/CalibrationStringLayout';
import { LegacyCalibrationLayout } from './layouts/LegacyCalibrationLayout';
import { MeiCalibrationLayout } from './layouts/MeiCalibrationLayout';
import { PolynomialCalibrationLayout } from './layouts/PolynomialCalibrationLayout';
import {
  FIRST_LENS_TOKEN,
  LENS_COUNT_TOKEN,
  V6_LENS_TOKENS,
  VERSIONED_TRAILING_TOKENS,
} from './offsetTokens';
import { GyroViewError } from '../../shared/errors/GyroViewError';

const TOKEN_SEPARATOR = '_';

const LAYOUTS: readonly CalibrationStringLayout[] = [
  new LegacyCalibrationLayout(),
  new PolynomialCalibrationLayout(),
  new MeiCalibrationLayout(),
];

/**
 * Parses `offset`, `offset_v2` and `offset_v3` strings into a {@link CalibrationSet}. The layout
 * is detected from the token count; the v6 layout (13 distortion coefficients per lens) is
 * recognised and rejected explicitly.
 */
export function parseOffsetString(text: string): CalibrationSet {
  const numbers = text.split(TOKEN_SEPARATOR).map((token) => parseNumber(token, text));
  const lensCount = numbers[LENS_COUNT_TOKEN] ?? 0;
  const layout = detectLayout(numbers.length, lensCount, text);
  const versionWord = numbers.at(-1) ?? 0;
  ensureVersionWordFits(layout, versionWord);
  const blocks = Array.from({ length: lensCount }, (_unused, lensIndex) =>
    lensBlock(numbers, FIRST_LENS_TOKEN + lensIndex * layout.lensTokens),
  );
  return {
    version: layout.version,
    canvas: layout.canvasOf(numbers, blocks),
    lenses: blocks.map((block, lensIndex) => layout.parseLens(block, lensIndex, versionWord)),
  };
}

function tokenCountFor(lensCount: number, lensTokens: number, trailingTokens: number): number {
  return FIRST_LENS_TOKEN + lensCount * lensTokens + trailingTokens;
}

function detectLayout(
  tokenCount: number,
  lensCount: number,
  text: string,
): CalibrationStringLayout {
  const layout = LAYOUTS.find(
    (candidate) =>
      tokenCount === tokenCountFor(lensCount, candidate.lensTokens, candidate.trailingTokens),
  );
  if (layout) return layout;
  if (tokenCount === tokenCountFor(lensCount, V6_LENS_TOKENS, VERSIONED_TRAILING_TOKENS)) {
    throw new GyroViewError(
      'unsupported-calibration',
      'calibration string uses the v6 layout (13 distortion coefficients), which is not supported yet',
    );
  }
  throw new GyroViewError(
    'invalid-calibration',
    `calibration string has ${tokenCount} tokens for ${lensCount} lenses, matching no known layout: ${text}`,
  );
}

function ensureVersionWordFits(layout: CalibrationStringLayout, versionWord: number): void {
  const problem = layout.versionWordProblem(versionWord);
  if (problem !== undefined) {
    throw new GyroViewError(
      'invalid-calibration',
      `calibration string has the v${layout.version} layout but ${problem}`,
    );
  }
}

function lensBlock(numbers: readonly number[], start: number): LensBlock {
  return (token) => numbers[start + token] ?? NaN;
}

function parseNumber(token: string, text: string): number {
  const value = Number(token);
  if (token.trim() === '' || !Number.isFinite(value)) {
    throw new GyroViewError(
      'invalid-calibration',
      `calibration token "${token}" is not a finite number in: ${text}`,
    );
  }
  return value;
}
