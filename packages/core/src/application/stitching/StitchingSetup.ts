import type { WindowCrop } from '../../domain/format/info/RecordingInfo';
import type { FrameRegion, LensLayout, LensSource } from '../../domain/format/layout/LensLayout';
import type { CalibrationSet, LensCalibration } from '../../domain/optics/LensCalibration';
import type { LensProjectionParameters } from '../../domain/optics/LensModel';
import { lensRotation } from '../../domain/optics/lensPose';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import type { Matrix3 } from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, type Radians } from '../../shared/units/angle';

/**
 * The part of the calibration canvas an encoded frame shows, in canvas pixels.
 */
export interface CanvasWindow {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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
  readonly frameIndex: number;
  readonly region: FrameRegion;
  readonly window: CanvasWindow;
  /**
   * Camera body frame to lens frame.
   */
  readonly rotation: Matrix3;
  readonly projection: LensProjectionParameters;
  readonly halfFieldOfView: Radians;
}

export interface StitchingSetup {
  readonly lenses: readonly LensStitch[];
  readonly frameCount: number;
  readonly feather: FeatherBand;
}

export interface StitchingInputs {
  readonly calibration: CalibrationSet;
  readonly layout: LensLayout;
  readonly windowCrop: WindowCrop | undefined;
  readonly feather?: FeatherBand;
}

export interface FrameSourceKey {
  readonly inputIndex: number;
  readonly trackIndex: number;
}

/**
 * Two 200-degree lenses overlap between 80 and 100 degrees from their axes; the default blend
 * is centred in that band.
 */
const FEATHER_START_DEGREES = 85;
const FEATHER_END_DEGREES = 95;

export const DEFAULT_FEATHER: FeatherBand = {
  start: degreesToRadians(degrees(FEATHER_START_DEGREES)),
  end: degreesToRadians(degrees(FEATHER_END_DEGREES)),
};

/**
 * The distinct video tracks a layout draws from, in order of first use by lens index. The
 * composition root hands the session its readers in this order, and {@link LensStitch.frameIndex}
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
  const lenses = layout.sources.map((source) => {
    const lens = lensOf(calibration, source.lensIndex);
    return {
      lensIndex: source.lensIndex,
      frameIndex: frames.findIndex((key) => isSameSource(key, source)),
      region: source.region,
      window: canvasWindowOf(calibration, lens, inputs.windowCrop),
      rotation: lensRotation(lens),
      projection: lens.model.projection,
      halfFieldOfView: lens.model.halfFieldOfView,
    };
  });
  return { lenses, frameCount: frames.length, feather: inputs.feather ?? DEFAULT_FEATHER };
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
 * the one holding its principal point. The encoded frame shows the sensor window the info
 * record describes (5312 of 5376 pixels on the X5), or the whole square when it says nothing.
 * Provisional: the window's meaning is confirmed on real frames (ADR 0008).
 */
function canvasWindowOf(
  calibration: CalibrationSet,
  lens: LensCalibration,
  crop: WindowCrop | undefined,
): CanvasWindow {
  const side = calibration.canvas.height;
  const squareX = Math.floor(lens.model.principalPoint.x / side) * side;
  const isCropped = crop?.cropWidth !== undefined && crop.cropHeight !== undefined;
  return isCropped
    ? {
        x: squareX + (crop.cropOffsetX ?? 0),
        y: crop.cropOffsetY ?? 0,
        width: crop.cropWidth,
        height: crop.cropHeight,
      }
    : { x: squareX, y: 0, width: side, height: side };
}
