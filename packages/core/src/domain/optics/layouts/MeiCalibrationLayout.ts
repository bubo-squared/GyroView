import {
  eulerDegrees,
  type CalibrationStringLayout,
  type LensBlock,
} from './CalibrationStringLayout';
import { CalibrationVersion, type CanvasSize, type LensCalibration } from '../LensCalibration';
import { MeiModel } from '../MeiModel';
import {
  V3_LENS_TOKENS,
  V3Token,
  VERSION_WORD_SHIFT,
  VERSIONED_TRAILING_TOKENS,
} from '../offsetTokens';
import { DEFAULT_HALF_FIELD_OF_VIEW } from '../opticsConstants';

/**
 * `offset_v3`: `xi fx fy cx cy yaw pitch roll tx ty tz k1 k2 k3 p1 p2 width height type` per
 * lens, then a version word with 3 in its high 16 bits.
 */
export class MeiCalibrationLayout implements CalibrationStringLayout {
  public readonly version = CalibrationVersion.Mei;
  public readonly lensTokens = V3_LENS_TOKENS;
  public readonly trailingTokens = VERSIONED_TRAILING_TOKENS;

  public versionWordProblem(versionWord: number): string | undefined {
    const declared = versionWord >>> VERSION_WORD_SHIFT;
    return declared === this.version ? undefined : `declares version ${declared}`;
  }

  public parseLens(block: LensBlock, lensIndex: number): LensCalibration {
    return {
      lensIndex,
      model: new MeiModel(
        {
          xi: block(V3Token.Xi),
          focal: [block(V3Token.FocalX), block(V3Token.FocalY)],
          principalPoint: { x: block(V3Token.CenterX), y: block(V3Token.CenterY) },
          radial: [block(V3Token.K1), block(V3Token.K2), block(V3Token.K3)],
          tangential: [block(V3Token.P1), block(V3Token.P2)],
        },
        DEFAULT_HALF_FIELD_OF_VIEW,
      ),
      orientation: eulerDegrees(block(V3Token.Yaw), block(V3Token.Pitch), block(V3Token.Roll)),
      translation: [
        block(V3Token.TranslationX),
        block(V3Token.TranslationY),
        block(V3Token.TranslationZ),
      ],
      lensType: block(V3Token.LensType),
    };
  }

  public canvasOf(_numbers: readonly number[], blocks: readonly LensBlock[]): CanvasSize {
    const [first] = blocks;
    return first
      ? { width: first(V3Token.CanvasWidth), height: first(V3Token.CanvasHeight) }
      : { width: 0, height: 0 };
  }
}
