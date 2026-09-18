import type {
  CalibrationVersion,
  CanvasSize,
  EulerDegrees,
  LensCalibration,
} from '../LensCalibration';
import { degrees } from '../../../shared/units/angle';

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
  parseLens(block: LensBlock, lensIndex: number, versionWord: number): LensCalibration;
  canvasOf(numbers: readonly number[], blocks: readonly LensBlock[]): CanvasSize;
}

export function eulerDegrees(yaw: number, pitch: number, roll: number): EulerDegrees {
  return { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) };
}
