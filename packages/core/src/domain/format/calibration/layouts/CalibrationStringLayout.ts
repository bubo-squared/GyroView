import type {
  CalibrationVersion,
  CanvasSize,
  EulerDegrees,
  LensCalibration,
} from '../../../optics/LensCalibration';
import { degrees } from '../../../../shared/units/angle';
import { VERSION_WORD_SHIFT, type DeclaredVersion } from '../offsetTokens';

/**
 * Reads one lens block by named token position.
 */
export type LensBlock = (token: number) => number;

/**
 * One version of the calibration string. Detection happens by token count; each layout knows
 * how to validate its version word, read a lens block and find the canvas size.
 */
export interface CalibrationStringLayout {
  readonly version: CalibrationVersion;
  readonly lensTokens: number;
  readonly trailingTokens: number;
  /**
   * Returns a message when the version word contradicts this layout, undefined when it fits.
   */
  versionWordProblem(versionWord: number): string | undefined;
  parseLens(block: LensBlock, lensIndex: number): LensCalibration;
  canvasOf(numbers: readonly number[], blocks: readonly LensBlock[]): CanvasSize;
}

export function eulerDegrees(yaw: number, pitch: number, roll: number): EulerDegrees {
  return { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) };
}

/**
 * For the versioned strings (v2, v3): what is wrong with a version word that does not declare
 * `expected` in its high bits, if anything.
 */
export function versionWordMismatch(
  versionWord: number,
  expected: DeclaredVersion,
): string | undefined {
  const declared = versionWord >>> VERSION_WORD_SHIFT;
  return declared === expected ? undefined : `declares version ${declared}`;
}

/**
 * For the versioned strings: the canvas the first lens block declares at the given token
 * positions; an empty canvas when there is no block.
 */
export function canvasOfFirstBlock(
  blocks: readonly LensBlock[],
  widthToken: number,
  heightToken: number,
): CanvasSize {
  const [first] = blocks;
  return first ? { width: first(widthToken), height: first(heightToken) } : EMPTY_CANVAS;
}

const EMPTY_CANVAS: CanvasSize = { width: 0, height: 0 };
