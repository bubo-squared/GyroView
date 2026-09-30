import type { FrameRegion, LensLayout, LensSource } from './LensLayout';
import { SEAM_RING_ANGLE } from './seamRing';
import type { CalibrationSet, LensCalibration } from '../optics/LensCalibration';
import type { LensProjectionParameters } from '../optics/LensModel';
import { lensRotation } from '../optics/lensPose';
import { scaledProjection } from '../optics/scaledProjection';
import type { DisplayConversion } from '../colour/DisplayConversion';
import { ensureInvariant, GyroViewError } from '../../shared/errors/GyroViewError';
import type { Matrix3 } from '../../shared/math/Matrix3';
import type { Rectangle } from '../../shared/math/Rectangle';
import { degrees, degreesToRadians, type Radians } from '../../shared/units/angle';

/**
 * The part of the calibration canvas an encoded frame shows, in canvas pixels.
 */
export type CanvasWindow = Rectangle<'canvas pixels'>;

/**
 * The angles from a lens's optical axis between which its weight fades from one to zero.
 */
export interface FeatherBand {
  readonly start: Radians;
  readonly end: Radians;
}

/**
 * Everything the renderer needs to sample one lens.
 */
export interface LensStitch {
  readonly lensIndex: number;
  /**
   * Which decoded frame of a pair holds this lens's pixels; see {@link lensFrameOrder}.
   */
  readonly frameSlot: number;
  readonly region: FrameRegion;
  readonly window: CanvasWindow;
  /**
   * Camera body frame to lens frame.
   */
  readonly rotation: Matrix3;
  readonly projection: LensProjectionParameters;
  readonly halfFieldOfView: Radians;
  /**
   * How the lens's texels are brought to the display (ADR 0033).
   */
  readonly displayConversion: DisplayConversion;
}

export interface StitchingSetup {
  readonly lenses: readonly LensStitch[];
  /**
   * How many decoded frames make up one pair: one per distinct track the lenses draw from.
   */
  readonly frameSlotCount: number;
  readonly feather: FeatherBand;
}

export interface StitchingInputs {
  readonly calibration: CalibrationSet;
  readonly layout: LensLayout;
  /**
   * The conversion each frame source is shown with, one per frame slot in
   * {@link lensFrameOrder}'s order (`displayConversionsOf`).
   */
  readonly displayConversions: readonly DisplayConversion[];
}

export interface FrameSourceKey {
  readonly inputIndex: number;
  readonly trackIndex: number;
}

/**
 * Two 200-degree lenses overlap between 80 and 100 degrees from their axes; the blend spans 5
 * degrees either side of the seam ring, which lies 90 degrees from both.
 */
const FEATHER_HALF_WIDTH_DEGREES = 5;

const DEFAULT_FEATHER: FeatherBand = {
  start: degreesToRadians(degrees(SEAM_RING_ANGLE - FEATHER_HALF_WIDTH_DEGREES)),
  end: degreesToRadians(degrees(SEAM_RING_ANGLE + FEATHER_HALF_WIDTH_DEGREES)),
};

/**
 * The distinct video tracks a layout draws from, in order of first use by lens index. The
 * composition root hands the session its readers in this order, and {@link LensStitch.frameSlot}
 * indexes the pairs the session presents.
 */
export function lensFrameOrder(layout: LensLayout): readonly FrameSourceKey[] {
  const keys: FrameSourceKey[] = [];
  for (const source of layout.sources) {
    if (keys.every((key) => !isSameSource(key, source))) {
      keys.push({ inputIndex: source.inputIndex, trackIndex: source.trackIndex });
    }
  }
  return keys;
}

/**
 * Use case: joins the factory calibration with the detected lens layout into the per-lens
 * parameters a renderer binds. Pure; the renderer only copies numbers into uniforms.
 */
export function buildStitchingSetup(inputs: StitchingInputs): StitchingSetup {
  const { calibration, layout } = inputs;
  if (calibration.lenses.length !== layout.sources.length) {
    throw new GyroViewError(
      'unsupported-layout',
      `the calibration describes ${calibration.lenses.length} lenses but the layout has ${layout.sources.length}`,
    );
  }
  const frames = lensFrameOrder(layout);
  ensureInvariant(
    inputs.displayConversions.length === frames.length,
    `${inputs.displayConversions.length} display conversions for ${frames.length} frame sources`,
  );
  const lenses = layout.sources.map((source) => {
    const lens = lensOf(calibration, source.lensIndex);
    const frameSlot = frames.findIndex((key) => isSameSource(key, source));
    return {
      lensIndex: source.lensIndex,
      frameSlot,
      region: source.region,
      window: canvasWindowOf(calibration, lens),
      rotation: lensRotation(lens),
      projection: scaledProjection(lens.model.projection, calibration.radialScale),
      halfFieldOfView: lens.model.halfFieldOfView,
      displayConversion: conversionAt(inputs.displayConversions, frameSlot),
    };
  });
  return { lenses, frameSlotCount: frames.length, feather: DEFAULT_FEATHER };
}

function conversionAt(
  conversions: readonly DisplayConversion[],
  frameSlot: number,
): DisplayConversion {
  const conversion = conversions[frameSlot];
  ensureInvariant(conversion !== undefined, `no display conversion for frame slot ${frameSlot}`);
  return conversion;
}

function isSameSource(key: FrameSourceKey, source: LensSource): boolean {
  return key.inputIndex === source.inputIndex && key.trackIndex === source.trackIndex;
}

function lensOf(calibration: CalibrationSet, lensIndex: number): LensCalibration {
  const lens = calibration.lenses.find((candidate) => candidate.lensIndex === lensIndex);
  if (!lens) {
    throw new GyroViewError('invalid-calibration', `the calibration has no lens ${lensIndex}`);
  }
  return lens;
}

/**
 * The canvas holds the lens images side by side in squares of its height; each lens's square is
 * the one holding its principal point, and the encoded frame shows that whole square. The info
 * record's sensor window (5312 of 5376 at offset 0 on the X5) is deliberately not applied: the
 * fisheye image circle sits at the centre of every X5 frame, where the whole square puts the
 * principal point, not 32 canvas pixels off where the window would (ADR 0014).
 */
function canvasWindowOf(calibration: CalibrationSet, lens: LensCalibration): CanvasWindow {
  const side = calibration.canvas.height;
  const squareX = Math.floor(lens.model.principalPoint.x / side) * side;
  return { x: squareX, y: 0, width: side, height: side };
}
