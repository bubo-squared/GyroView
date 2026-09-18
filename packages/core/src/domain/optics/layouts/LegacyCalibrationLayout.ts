import {
  eulerDegrees,
  type CalibrationStringLayout,
  type LensBlock,
} from './CalibrationStringLayout';
import { EquidistantModel } from '../EquidistantModel';
import { CalibrationVersion, type CanvasSize, type LensCalibration } from '../LensCalibration';
import {
  FIRST_LENS_TOKEN,
  LENS_COUNT_TOKEN,
  V1_LENS_TOKENS,
  V1_LENS_TYPE_MASK,
  V1_TRAILING_TOKENS,
  V1Token,
  V1Trailing,
} from '../offsetTokens';
import { DEFAULT_HALF_FIELD_OF_VIEW } from '../opticsConstants';

/**
 * The original `offset` string: `r cx cy yaw pitch roll` per lens, then canvas width and height,
 * then a word whose low bits hold the lens type. The word's upper bits differ between cameras
 * (1 on the X5, 3 on the ONE R), so they are not treated as a version.
 */
export class LegacyCalibrationLayout implements CalibrationStringLayout {
  public readonly version = CalibrationVersion.Legacy;
  public readonly lensTokens = V1_LENS_TOKENS;
  public readonly trailingTokens = V1_TRAILING_TOKENS;

  public versionWordProblem(): string | undefined {
    return undefined;
  }

  public parseLens(block: LensBlock, lensIndex: number, versionWord: number): LensCalibration {
    return {
      lensIndex,
      model: new EquidistantModel(
        {
          edgeRadius: block(V1Token.EdgeRadius),
          principalPoint: { x: block(V1Token.CenterX), y: block(V1Token.CenterY) },
        },
        DEFAULT_HALF_FIELD_OF_VIEW,
      ),
      orientation: eulerDegrees(block(V1Token.Yaw), block(V1Token.Pitch), block(V1Token.Roll)),
      translation: [0, 0, 0],
      lensType: versionWord & V1_LENS_TYPE_MASK,
    };
  }

  public canvasOf(numbers: readonly number[]): CanvasSize {
    const lensCount = numbers[LENS_COUNT_TOKEN] ?? 0;
    const trailingStart = FIRST_LENS_TOKEN + lensCount * this.lensTokens;
    return {
      width: numbers[trailingStart + V1Trailing.CanvasWidth] ?? 0,
      height: numbers[trailingStart + V1Trailing.CanvasHeight] ?? 0,
    };
  }
}
