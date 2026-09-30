import {
  canvasOfFirstBlock,
  eulerDegrees,
  versionWordMismatch,
  type CalibrationStringLayout,
  type LensBlock,
} from './CalibrationStringLayout';
import { RADIUS_AS_READ, type LensCalibration } from '../../../optics/LensCalibration';
import type { MeiDistortion } from '../../../optics/MeiDistortion';
import { CalibrationVersion } from '../CalibrationVersion';
import { MeiModel } from '../../../optics/MeiModel';
import {
  MeiToken,
  V3_LENS_TOKENS,
  V3Token,
  V6_LENS_TOKENS,
  V6Token,
  VERSIONED_TRAILING_TOKENS,
} from '../offsetTokens';
import {
  RADIAL_AND_FIRST_PAIR,
  type V6DistortionTokens,
  type V6TermReading,
} from '../v6TermReading';

/**
 * What tells one Mei string version from another: the version its word declares, the length of
 * its lens block, where in the block the canvas size sits, how its distortion terms read, and
 * the radial scale its lenses are drawn at. The tokens up to the translation are every
 * version's ({@link MeiToken}).
 */
export interface MeiStringFormat {
  readonly version: CalibrationVersion;
  readonly lensTokens: number;
  readonly canvasTokens: { readonly width: number; readonly height: number };
  readonly distortionOf: (block: LensBlock) => MeiDistortion;
  readonly radialScale: number;
}

/**
 * The layout of a Mei string version, a version word after its lens blocks.
 */
export function meiLayout(format: MeiStringFormat): CalibrationStringLayout {
  return {
    version: format.version,
    lensTokens: format.lensTokens,
    trailingTokens: VERSIONED_TRAILING_TOKENS,
    radialScale: format.radialScale,
    versionWordProblem: (versionWord) => versionWordMismatch(versionWord, format.version),
    parseLens: (block, lensIndex) => meiLensOf(block, lensIndex, format),
    canvasOf: (_numbers, blocks) =>
      canvasOfFirstBlock(blocks, format.canvasTokens.width, format.canvasTokens.height),
  };
}

function meiLensOf(block: LensBlock, lensIndex: number, format: MeiStringFormat): LensCalibration {
  return {
    lensIndex,
    model: new MeiModel({
      xi: block(MeiToken.Xi),
      focal: [block(MeiToken.FocalX), block(MeiToken.FocalY)],
      principalPoint: { x: block(MeiToken.CenterX), y: block(MeiToken.CenterY) },
      distortion: format.distortionOf(block),
    }),
    orientation: eulerDegrees(block(MeiToken.Yaw), block(MeiToken.Pitch), block(MeiToken.Roll)),
    translation: [
      block(MeiToken.TranslationX),
      block(MeiToken.TranslationY),
      block(MeiToken.TranslationZ),
    ],
  };
}

/**
 * `offset_v3`: the Mei tokens, then `k1 k2 k3 p1 p2 width height type` per lens, and a version
 * word with 3 in its high 16 bits. Drawn as read: the X5, the only camera seen to write it,
 * stitches through its legacy string (ADR 0023).
 */
export const MEI_CALIBRATION_LAYOUT = meiLayout({
  version: CalibrationVersion.Mei,
  lensTokens: V3_LENS_TOKENS,
  canvasTokens: { width: V3Token.CanvasWidth, height: V3Token.CanvasHeight },
  distortionOf: (block) => ({
    radial: [block(V3Token.K1), block(V3Token.K2), block(V3Token.K3)],
    tangential: [{ p1: block(V3Token.P1), p2: block(V3Token.P2) }],
    thinPrism: [],
  }),
  radialScale: RADIUS_AS_READ,
});

/**
 * The radial scale a v6 reading is drawn at, measured on the X6, the one camera seen to stitch
 * through it: Insta360 Studio's far field and the seam's far bins agree on it to 0.3 percent
 * (ADR 0023). Provisional, from one unit; the X5's own v6 strings would want 1.02 to 1.04, but
 * the X5 stitches through its legacy string.
 */
const V6_RADIAL_SCALE = 1.008;

/**
 * `offset_v6`: the Mei tokens, then `k1..k5 p1..p4 s1..s4 width height type` per lens, and a
 * version word with 6 in its high 16 bits; its distortion tokens read by `reading` (ADR 0032).
 */
export function extendedMeiLayout(reading: V6TermReading): CalibrationStringLayout {
  return meiLayout({
    version: CalibrationVersion.ExtendedMei,
    lensTokens: V6_LENS_TOKENS,
    canvasTokens: { width: V6Token.CanvasWidth, height: V6Token.CanvasHeight },
    distortionOf: (block) => reading(v6DistortionTokensOf(block)),
    radialScale: V6_RADIAL_SCALE,
  });
}

/**
 * `offset_v6` as the player reads it: its radial terms and first tangential pair (ADR 0032,
 * provisional).
 */
export const EXTENDED_MEI_CALIBRATION_LAYOUT = extendedMeiLayout(RADIAL_AND_FIRST_PAIR);

function v6DistortionTokensOf(block: LensBlock): V6DistortionTokens {
  return {
    radial: [
      block(V6Token.K1),
      block(V6Token.K2),
      block(V6Token.K3),
      block(V6Token.K4),
      block(V6Token.K5),
    ],
    tangential: [block(V6Token.P1), block(V6Token.P2), block(V6Token.P3), block(V6Token.P4)],
    thinPrism: [block(V6Token.S1), block(V6Token.S2), block(V6Token.S3), block(V6Token.S4)],
  };
}
