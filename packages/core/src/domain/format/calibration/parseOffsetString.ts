import type { VersionedCalibration } from './CalibrationVersion';
import type { CanvasSize } from '../../optics/LensCalibration';
import { type CalibrationStringLayout, type LensBlock } from './layouts/CalibrationStringLayout';
import { LEGACY_CALIBRATION_LAYOUT } from './layouts/LegacyCalibrationLayout';
import {
  EXTENDED_MEI_CALIBRATION_LAYOUT,
  MEI_CALIBRATION_LAYOUT,
} from './layouts/MeiCalibrationLayout';
import { POLYNOMIAL_CALIBRATION_LAYOUT } from './layouts/PolynomialCalibrationLayout';
import { FIRST_LENS_TOKEN, LENS_COUNT_TOKEN } from './offsetTokens';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

const TOKEN_SEPARATOR = '_';

/**
 * Every camera the format describes has two lenses: a string for another count calibrates none
 * of them, however well it parses.
 */
const LENSES_OF_A_CAMERA = 2;

/**
 * Every calibration string version the player reads; their token counts never coincide for a
 * lens count.
 */
const CALIBRATION_LAYOUTS: readonly CalibrationStringLayout[] = [
  LEGACY_CALIBRATION_LAYOUT,
  POLYNOMIAL_CALIBRATION_LAYOUT,
  MEI_CALIBRATION_LAYOUT,
  EXTENDED_MEI_CALIBRATION_LAYOUT,
];

/**
 * Parses a calibration string of any version into a calibration set with its version, the layout
 * detected from the token count among `layouts`: the player's, or a measurement's own readings.
 */
export function parseOffsetString(
  text: string,
  layouts: readonly CalibrationStringLayout[] = CALIBRATION_LAYOUTS,
): VersionedCalibration {
  const numbers = text.split(TOKEN_SEPARATOR).map((token) => parseNumber(token));
  const lensCount = numbers[LENS_COUNT_TOKEN] ?? 0;
  const layout = detectLayout(layouts, numbers);
  const versionWord = numbers.at(-1) ?? 0;
  ensureVersionWordFits(layout, versionWord);
  const blocks = Array.from({ length: lensCount }, (_unused, lensIndex) =>
    lensBlock(numbers, FIRST_LENS_TOKEN + lensIndex * layout.lensTokens),
  );
  const canvas = layout.canvasOf(numbers, blocks);
  ensurePlausible(layout, blocks, canvas);
  return {
    version: layout.version,
    canvas,
    lenses: blocks.map((block, lensIndex) => layout.parseLens(block, lensIndex)),
    radialScale: layout.radialScale,
  };
}

/**
 * Refuses a string that parses but could calibrate no camera, so that the next string is tried
 * instead of failing later on a lens count or drawing nothing.
 */
function ensurePlausible(
  layout: CalibrationStringLayout,
  blocks: readonly LensBlock[],
  canvas: CanvasSize,
): void {
  const problem = implausibilityOf(layout, blocks, canvas);
  if (problem !== undefined) {
    throw new GyroViewError(
      'invalid-calibration',
      `calibration string has the v${layout.version} layout but ${problem}`,
    );
  }
}

function implausibilityOf(
  layout: CalibrationStringLayout,
  blocks: readonly LensBlock[],
  canvas: CanvasSize,
): string | undefined {
  if (blocks.length !== LENSES_OF_A_CAMERA) return `describes ${blocks.length} lenses`;
  if (canvas.width <= 0 || canvas.height <= 0) {
    return `a canvas of ${canvas.width}x${canvas.height}`;
  }
  const scales = blocks.flatMap((block) => layout.scaleTokens.map((token) => block(token)));
  const unscaled = scales.find((scale) => scale <= 0);
  return unscaled === undefined ? undefined : `a lens of scale ${unscaled}`;
}

function tokenCountFor(lensCount: number, lensTokens: number, trailingTokens: number): number {
  return FIRST_LENS_TOKEN + lensCount * lensTokens + trailingTokens;
}

function detectLayout(
  layouts: readonly CalibrationStringLayout[],
  numbers: readonly number[],
): CalibrationStringLayout {
  const lensCount = numbers[LENS_COUNT_TOKEN] ?? 0;
  const layout = layouts.find(
    (candidate) =>
      numbers.length === tokenCountFor(lensCount, candidate.lensTokens, candidate.trailingTokens),
  );
  if (layout) return layout;
  throw new GyroViewError(
    'invalid-calibration',
    `calibration string has ${numbers.length} tokens for ${lensCount} lenses, matching no known layout`,
  );
}

function ensureVersionWordFits(layout: CalibrationStringLayout, versionWord: number): void {
  const problem = layout.versionWordProblem?.(versionWord);
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

function parseNumber(token: string): number {
  const value = Number(token);
  if (token.trim() === '' || !Number.isFinite(value)) {
    throw new GyroViewError(
      'invalid-calibration',
      `calibration token "${token}" is not a finite number`,
    );
  }
  return value;
}
