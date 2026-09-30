import {
  canvasOfFirstBlock,
  eulerDegrees,
  versionWordMismatch,
  type CalibrationStringLayout,
  type LensBlock,
} from './CalibrationStringLayout';
import { AS_READ, type CanvasSize, type LensCalibration } from '../../../optics/LensCalibration';
import { CalibrationVersion } from '../CalibrationVersion';
import { V2_LENS_TOKENS, V2Token, VERSIONED_TRAILING_TOKENS } from '../offsetTokens';
import { PolynomialModel } from '../../../optics/PolynomialModel';

/**
 * `offset_v2`: `r cx cy yaw pitch roll tx ty tz c1 c2 c3 c4 width height type` per lens, then
 * a version word with 2 in its high 16 bits.
 */
export const POLYNOMIAL_CALIBRATION_LAYOUT: CalibrationStringLayout = {
  version: CalibrationVersion.Polynomial,
  lensTokens: V2_LENS_TOKENS,
  trailingTokens: VERSIONED_TRAILING_TOKENS,

  versionWordProblem: (versionWord: number): string | undefined =>
    versionWordMismatch(versionWord, CalibrationVersion.Polynomial),

  parseLens(block: LensBlock, lensIndex: number): LensCalibration {
    return {
      lensIndex,
      model: new PolynomialModel({
        edgeRadius: block(V2Token.EdgeRadius),
        principalPoint: { x: block(V2Token.CenterX), y: block(V2Token.CenterY) },
        coefficients: [block(V2Token.C1), block(V2Token.C2), block(V2Token.C3), block(V2Token.C4)],
      }),
      orientation: eulerDegrees(block(V2Token.Yaw), block(V2Token.Pitch), block(V2Token.Roll)),
      translation: [
        block(V2Token.TranslationX),
        block(V2Token.TranslationY),
        block(V2Token.TranslationZ),
      ],
      radialScale: AS_READ,
    };
  },

  canvasOf(_numbers: readonly number[], blocks: readonly LensBlock[]): CanvasSize {
    return canvasOfFirstBlock(blocks, V2Token.CanvasWidth, V2Token.CanvasHeight);
  },
};
