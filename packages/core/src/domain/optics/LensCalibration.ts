import type { LensModel } from './LensModel';
import type { Vector3 } from '../../shared/math/Vector3';
import type { Degrees } from '../../shared/units/angle';

export interface EulerDegrees {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly roll: Degrees;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

/**
 * One lens of the camera: its projection model and its pose relative to the first lens.
 */
export interface LensCalibration {
  readonly index: number;
  readonly model: LensModel;
  readonly orientation: EulerDegrees;
  /**
   * Position of the lens relative to lens 0, in metres. Zero for lens 0; about 3.2 cm for
   * the back lens of an X5. Unknown (zero) in the legacy format.
   */
  readonly translation: Vector3;
  readonly lensType: number | undefined;
}

/**
 * Which calibration string a set came from, in increasing order of fidelity.
 */
export const CalibrationVersion = { Legacy: 1, Polynomial: 2, Mei: 3 } as const;

export type CalibrationVersion = (typeof CalibrationVersion)[keyof typeof CalibrationVersion];

/**
 * The full factory calibration of a recording: every lens on a shared canvas whose width holds
 * the lens images side by side.
 */
export interface CalibrationSet {
  readonly version: CalibrationVersion;
  readonly canvas: CanvasSize;
  readonly lenses: readonly LensCalibration[];
}
