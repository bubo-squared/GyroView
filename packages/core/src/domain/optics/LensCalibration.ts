import type { LensModel } from './LensModel';
import type { Vector3 } from '../../shared/math/Vector3';
import type { Degrees } from '../../shared/units/angle';
import type { Size } from '../../shared/math/Rectangle';

export interface EulerDegrees {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly roll: Degrees;
}

/**
 * The calibration canvas's size, in its pixels.
 */
export type CanvasSize = Size<'canvas pixels'>;

/**
 * One lens of the camera: its projection model and its pose relative to the first lens.
 */
export interface LensCalibration {
  readonly lensIndex: number;
  readonly model: LensModel;
  readonly orientation: EulerDegrees;
  /**
   * Position of the lens relative to lens 0, in metres. Zero for lens 0; about 3.2 cm for
   * the back lens of an X5. Unknown (zero) in the legacy format.
   */
  readonly translation: Vector3;
  /**
   * The factor on the image radius the lens is drawn at, against its model's reading of the
   * string: what the reading of a string version measured it needs, or 1 (ADR 0023).
   */
  readonly radialScale: number;
}

/**
 * The radial scale of a reading drawn as its string gives it.
 */
export const AS_READ = 1;

/**
 * The full factory calibration of a recording: every lens on a shared canvas whose width holds
 * the lens images side by side.
 */
export interface CalibrationSet {
  readonly canvas: CanvasSize;
  readonly lenses: readonly LensCalibration[];
}
