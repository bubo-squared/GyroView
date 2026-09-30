import {
  MeiToken,
  V6_LENS_TOKENS,
  V6Token,
  VERSION_WORD_SHIFT,
} from '../../src/domain/format/calibration/offsetTokens';
import { CalibrationVersion } from '../../src/domain/format/calibration/CalibrationVersion';

/**
 * Legacy calibration string of the ONE R fixture (test/fixtures/thirdparty/insta360py/sample.insv):
 * version word 3105 = lens type 33 with different upper bits than the X5's 1137.
 */
export const ONE_R_LEGACY_CALIBRATION =
  '2_1480.69_1517.57_1520.13_-0.186949_0.0336344_-179.227_1479.61_4553.12_1526.43_0.82149_0.0305849_0.894074_6080_3040_3105';

/**
 * The shape of an X6 calibration: two 7744-pixel squares side by side, lens type 193 (the X6's,
 * per insta360-rs's lens catalogue). Every lens value below is invented and round.
 */
const X6_SQUARE = 7744;
const X6_LENS_TYPE = 193;
const INVENTED_LENS = {
  xi: 2.5,
  focal: 7000,
  roll: 90,
  radial: [0.2, 1, 0, -4, 0],
  tangential: [0.001, -0.001, 0.01, 0.01],
  thinPrism: [0.001, 0, 0.01, -0.01],
} as const;
/**
 * The low bits every versioned word seen so far carries (0x0400).
 */
const VERSION_WORD_LOW_BITS = 0x04_00;

/**
 * A v6 string of the X6's shape with invented values: each lens centred in its square, the second
 * lens facing back 3 cm behind the first.
 */
export function v6CalibrationString(): string {
  const lenses = [0, 1].flatMap((lensIndex) => v6LensBlock(lensIndex));
  const versionWord =
    CalibrationVersion.ExtendedMei * 2 ** VERSION_WORD_SHIFT + VERSION_WORD_LOW_BITS;
  return ['2', ...lenses, versionWord].join('_');
}

function v6LensBlock(lensIndex: number): number[] {
  const block = Array.from({ length: V6_LENS_TOKENS }, () => 0);
  const set = (token: number, value: number): void => {
    block[token] = value;
  };
  set(MeiToken.Xi, INVENTED_LENS.xi);
  set(MeiToken.FocalX, INVENTED_LENS.focal);
  set(MeiToken.FocalY, INVENTED_LENS.focal);
  set(MeiToken.CenterX, lensIndex * X6_SQUARE + X6_SQUARE / 2);
  set(MeiToken.CenterY, X6_SQUARE / 2);
  set(MeiToken.Roll, INVENTED_LENS.roll);
  set(MeiToken.TranslationZ, lensIndex * -0.03);
  for (const [index, value] of INVENTED_LENS.radial.entries()) set(V6Token.K1 + index, value);
  for (const [index, value] of INVENTED_LENS.tangential.entries()) set(V6Token.P1 + index, value);
  for (const [index, value] of INVENTED_LENS.thinPrism.entries()) set(V6Token.S1 + index, value);
  set(V6Token.CanvasWidth, 2 * X6_SQUARE);
  set(V6Token.CanvasHeight, X6_SQUARE);
  set(V6Token.LensType, X6_LENS_TYPE);
  return block;
}
