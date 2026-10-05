import {
  eulerDegrees,
  type CalibrationStringLayout,
  type LensBlock,
} from './CalibrationStringLayout';
import { EquidistantModel } from '../../../optics/EquidistantModel';
import { LEGACY_RADIUS_ANGLE } from '../../../optics/opticsConstants';
import {
  RADIUS_AS_READ,
  type CanvasSize,
  type LensCalibration,
} from '../../../optics/LensCalibration';
import { CalibrationVersion } from '../CalibrationVersion';
import {
  FIRST_LENS_TOKEN,
  LENS_COUNT_TOKEN,
  V1_LENS_TOKENS,
  V1_TRAILING_TOKENS,
  V1Token,
  V1Trailing,
} from '../offsetTokens';

/**
 * The original `offset` string: `r cx cy yaw pitch roll` per lens, then canvas width and height,
 * then a word whose low bits hold the lens type. The word's upper bits differ between cameras
 * (1 on the X5, 3 on the ONE R), so they are not treated as a version.
 */
export const LEGACY_CALIBRATION_LAYOUT: CalibrationStringLayout = {
  version: CalibrationVersion.Legacy,
  lensTokens: V1_LENS_TOKENS,
  trailingTokens: V1_TRAILING_TOKENS,
  radialScale: RADIUS_AS_READ,

  parseLens(block: LensBlock, lensIndex: number): LensCalibration {
    return {
      lensIndex,
      model: new EquidistantModel({
        radius: block(V1Token.EdgeRadius),
        radiusAngle: LEGACY_RADIUS_ANGLE,
        principalPoint: { x: block(V1Token.CenterX), y: block(V1Token.CenterY) },
      }),
      orientation: eulerDegrees(block(V1Token.Yaw), block(V1Token.Pitch), block(V1Token.Roll)),
      translation: [0, 0, 0],
    };
  },

  canvasOf(numbers: readonly number[]): CanvasSize {
    const lensCount = numbers[LENS_COUNT_TOKEN] ?? 0;
    const trailingStart = FIRST_LENS_TOKEN + lensCount * V1_LENS_TOKENS;
    return {
      width: numbers[trailingStart + V1Trailing.CanvasWidth] ?? 0,
      height: numbers[trailingStart + V1Trailing.CanvasHeight] ?? 0,
    };
  },
};
