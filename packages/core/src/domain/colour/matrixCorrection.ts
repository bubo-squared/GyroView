import { IDENTITY_MATRIX3, multiplyMatrices, type Matrix3 } from '../../shared/math/Matrix3';
import type { MatrixCoefficients } from './TrackColour';

/**
 * A Y′CbCr matrix by the weights of red and blue in its luma.
 */
interface LumaWeights {
  readonly red: number;
  readonly blue: number;
}

/**
 * The weights of each matrix (ITU-R BT.709-6 item 3.2, BT.2020-2 table 4, BT.601-7 item 2.5.1,
 * whose SD matrices BT.470BG and SMPTE 170M share); none for RGB or a matrix left unsaid.
 */
const LUMA_WEIGHTS: Readonly<Record<MatrixCoefficients, LumaWeights | undefined>> = {
  bt709: { red: 0.2126, blue: 0.0722 },
  'bt2020-ncl': { red: 0.2627, blue: 0.0593 },
  bt470bg: { red: 0.299, blue: 0.114 },
  smpte170m: { red: 0.299, blue: 0.114 },
  rgb: undefined,
  unspecified: undefined,
};

/**
 * The matrix that brings R′G′B′ a platform derived from Y′CbCr through `applied` to the R′G′B′
 * `recorded` gives: WebKit's decoders convert with BT.709 whatever a stream says (ADR 0033). No
 * correction when the two agree, or either is not known.
 */
export function matrixCorrectionOf(
  recorded: MatrixCoefficients,
  applied: MatrixCoefficients,
): Matrix3 {
  const to = LUMA_WEIGHTS[recorded];
  const from = LUMA_WEIGHTS[applied];
  return to === undefined || from === undefined || recorded === applied
    ? IDENTITY_MATRIX3
    : multiplyMatrices(rgbFromYcbcr(to), ycbcrFromRgb(from));
}

/**
 * R′G′B′ of Y′, Pb and Pr.
 */
function rgbFromYcbcr({ red, blue }: LumaWeights): Matrix3 {
  const green = 1 - red - blue;
  const redChroma = 2 * (1 - red);
  const blueChroma = 2 * (1 - blue);
  return [
    1,
    0,
    redChroma,
    1,
    (-blue * blueChroma) / green,
    (-red * redChroma) / green,
    1,
    blueChroma,
    0,
  ];
}

/**
 * Y′, Pb and Pr of R′G′B′.
 */
function ycbcrFromRgb({ red, blue }: LumaWeights): Matrix3 {
  const green = 1 - red - blue;
  const blueChroma = 2 * (1 - blue);
  const redChroma = 2 * (1 - red);
  return [
    red,
    green,
    blue,
    -red / blueChroma,
    -green / blueChroma,
    (1 - blue) / blueChroma,
    (1 - red) / redChroma,
    -green / redChroma,
    -blue / redChroma,
  ];
}
