import { IDENTITY_MATRIX3, transformVector, type Matrix3 } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import type {
  ColourPrimaries,
  MatrixCoefficients,
  TrackColour,
  TransferCharacteristics,
} from './TrackColour';

/**
 * How scene light is brought to the display: an exposure, a roll-off of the luminance above
 * `kneeStart` whose curve approaches `ceiling`, and the display's encoding power (BT.1886's 2.4,
 * or less).
 */
export interface ToneCurve {
  readonly exposure: number;
  readonly kneeStart: number;
  readonly ceiling: number;
  readonly exponent: number;
}

/**
 * How a lens's texels are brought to the SDR BT.709 display the player draws on, as parameters a
 * shader evaluates (ADR 0033). The texels hold what the browser's upload makes of a decoded
 * frame: its range applied, its primaries and transfer as recorded, and R′G′B′ through the
 * matrix the frame names, which the renderer brings back to `matrix`, the track's, where the two
 * differ (`matrixCorrectionOf`).
 */
export type DisplayConversion =
  | { readonly kind: 'as-recorded'; readonly matrix: MatrixCoefficients }
  | {
      readonly kind: 'hlg-to-sdr-bt709';
      readonly matrix: MatrixCoefficients;
      readonly gamut: Matrix3;
      readonly tone: ToneCurve;
    };

/**
 * SDR as the browser uploads it: BT.709 and sRGB are close enough to show as recorded, as the
 * player always has; its matrix unsaid, so no texel is corrected.
 */
export const AS_RECORDED: DisplayConversion = { kind: 'as-recorded', matrix: 'unspecified' };

/**
 * BT.2100 HLG's inverse OETF (ITU-R BT.2100-2, table 5): `E'² / 3` up to half signal, then
 * `(exp((E' - c) / a) + b) / 12`, with a, b (1 - 4a) and c; the shader's defines come from here.
 */
export const HLG_OETF = {
  a: 0.17883277,
  b: 0.28466892,
  c: 0.55991073,
  segmentJoin: 0.5,
  squareSegmentDivisor: 3,
  logSegmentDivisor: 12,
} as const;

/**
 * Linear BT.2020 to linear BT.709 RGB (ITU-R BT.2087-0, equation 5), to seven decimals as the two
 * sets of primaries and their shared D65 white derive it, so each row sums to one and greys stay
 * grey.
 */
/* eslint-disable @typescript-eslint/no-magic-numbers -- a published matrix, cited above */
const BT2020_TO_BT709: Matrix3 = [
  1.660491, -0.5876411, -0.0728499, -0.1245505, 1.1328999, -0.0083494, -0.0181508, -0.1005789,
  1.1187297,
];
/* eslint-enable @typescript-eslint/no-magic-numbers */

/**
 * BT.709's luminance of linear red, green and blue (ITU-R BT.709-6, item 3.2): what the highlight
 * roll-off acts on, so a colour keeps its hue as it rolls off.
 */
/* eslint-disable @typescript-eslint/no-magic-numbers -- published coefficients, cited above */
export const BT709_LUMINANCE: Vector3 = [0.2126, 0.7152, 0.0722];
/* eslint-enable @typescript-eslint/no-magic-numbers */

/**
 * Insta360 Studio's own HLG-to-SDR curve, fitted pixel by pixel to the X6's HLG and Rec.709
 * exports of the same stitch: scene light, no OOTF, brought up by two fifths, its luminance
 * rolled off above 0.2 and encoded with a power of 1/2.2 (ADR 0033).
 */
const STUDIO_TONE: ToneCurve = { exposure: 1.4, kneeStart: 0.2, ceiling: 1.5, exponent: 2.2 };

/**
 * HLG of BT.2020 primaries and matrix, as BT.2100 defines it and the X6 records it, shown as
 * Studio shows it: the conversion `displayConversionsOf` picks for such a track, for tests.
 */
export const HLG_TO_SDR_BT709 = {
  kind: 'hlg-to-sdr-bt709',
  matrix: 'bt2020-ncl',
  gamut: BT2020_TO_BT709,
  tone: STUDIO_TONE,
} satisfies DisplayConversion;

/**
 * What a conversion chosen for a track's colour leaves wrong, if anything.
 */
interface ConversionChoice {
  readonly conversion: DisplayConversion;
  readonly problem?: string;
}

/**
 * The primaries SDR is shown as recorded with: BT.709's, and the SD primaries close to them; a
 * track that names none is taken for BT.709.
 */
const BT709_LIKE_PRIMARIES: ReadonlySet<ColourPrimaries> = new Set([
  'bt709',
  'bt470bg',
  'smpte170m',
  'unspecified',
]);

/**
 * The matrix that brings HLG's linear light into BT.709, by the track's primaries: none for
 * BT.709, BT.2087's for BT.2020, which BT.2100 means when a track names none. Undefined for
 * primaries HLG is not recorded with, whose gamut is left as it is.
 */
const HLG_GAMUT_BY_PRIMARIES: Readonly<Record<ColourPrimaries, Matrix3 | undefined>> = {
  bt709: IDENTITY_MATRIX3,
  bt2020: BT2020_TO_BT709,
  unspecified: BT2020_TO_BT709,
  bt470bg: undefined,
  smpte170m: undefined,
  smpte432: undefined,
};

/**
 * A track's texels shown as recorded, its own matrix still corrected back to: what the player
 * draws of SDR, and the measurements of a recording drawn in its own signal.
 */
export function asRecordedOf({ matrix }: Pick<DisplayConversion, 'matrix'>): DisplayConversion {
  return { kind: 'as-recorded', matrix };
}

function asRecordedFrom(colour: TrackColour): ConversionChoice {
  const conversion = asRecordedOf(colour);
  return BT709_LIKE_PRIMARIES.has(colour.primaries)
    ? { conversion }
    : { conversion, problem: `${colour.primaries} primaries are shown as BT.709` };
}

function hlgFrom(colour: TrackColour): ConversionChoice {
  const gamut = HLG_GAMUT_BY_PRIMARIES[colour.primaries];
  const conversion = {
    kind: 'hlg-to-sdr-bt709',
    matrix: colour.matrix,
    gamut: gamut ?? IDENTITY_MATRIX3,
    tone: STUDIO_TONE,
  } as const;
  return gamut === undefined
    ? { conversion, problem: `HLG of ${colour.primaries} primaries is shown without their gamut` }
    : { conversion };
}

function notShown(transfer: TransferCharacteristics): (colour: TrackColour) => ConversionChoice {
  return (colour) => ({
    conversion: asRecordedOf(colour),
    problem: `the ${transfer} transfer cannot be shown yet: drawn as recorded`,
  });
}

/**
 * The conversion of every transfer, from the track's colour: a transfer the player learns to
 * name does not compile until it is given one.
 */
const CONVERSION_BY_TRANSFER: Readonly<
  Record<TransferCharacteristics, (colour: TrackColour) => ConversionChoice>
> = {
  bt709: asRecordedFrom,
  smpte170m: asRecordedFrom,
  'iec61966-2-1': asRecordedFrom,
  unspecified: asRecordedFrom,
  hlg: hlgFrom,
  pq: notShown('pq'),
  linear: notShown('linear'),
};

/**
 * The conversion each decoded frame source is shown with, in frame-slot order, and what could not
 * be shown as it should.
 */
export interface DisplayConversionChoice {
  readonly conversions: readonly DisplayConversion[];
  readonly warnings: readonly string[];
}

/**
 * Picks a conversion for each track's colour; a colour no conversion shows is drawn as recorded,
 * with a warning, rather than refused: the picture is there, its colours wrong. Tracks that share
 * a problem share its warning.
 */
export function displayConversionsOf(colours: readonly TrackColour[]): DisplayConversionChoice {
  const choices = colours.map((colour) => CONVERSION_BY_TRANSFER[colour.transfer](colour));
  const problems = choices.flatMap((choice) =>
    choice.problem === undefined ? [] : [choice.problem],
  );
  return {
    conversions: choices.map((choice) => choice.conversion),
    warnings: [...new Set(problems)],
  };
}

/**
 * Scene light of an HLG signal, both from 0 to 1 (BT.2100 inverse OETF).
 */
export function hlgInverseOetf(signal: number): number {
  const { a, b, c, segmentJoin, squareSegmentDivisor, logSegmentDivisor } = HLG_OETF;
  return signal <= segmentJoin
    ? (signal * signal) / squareSegmentDivisor
    : (Math.exp((signal - c) / a) + b) / logSegmentDivisor;
}

/**
 * A texel, red, green and blue from 0 to 1, where the lens's exposure is a factor: what gain
 * matching measures and scales (ADR 0012). As recorded for SDR, whose encoding is close to a
 * power of light; for HLG, scene light in BT.709 raised to the display's power, before the
 * conversion's exposure and highlight roll-off, so a white still fits the seam meter's 8 bits.
 */
export function exposureSignalOf(conversion: DisplayConversion, texel: Vector3): Vector3 {
  switch (conversion.kind) {
    case 'as-recorded': {
      return texel;
    }
    case 'hlg-to-sdr-bt709': {
      const scene = mapRgb(texel, (channel) => hlgInverseOetf(Math.max(channel, 0)));
      const light = transformVector(conversion.gamut, scene);
      return mapRgb(light, (channel) => Math.max(channel, 0) ** (1 / conversion.tone.exponent));
    }
  }
}

/**
 * An exposure signal as the display shows it: for HLG, exposed and its highlights rolled off.
 */
export function shownOf(conversion: DisplayConversion, signal: Vector3): Vector3 {
  switch (conversion.kind) {
    case 'as-recorded': {
      return signal;
    }
    case 'hlg-to-sdr-bt709': {
      return tonedFrom(signal, conversion.tone);
    }
  }
}

/**
 * A texel as the display shows it: the reference the shader's conversion is held to.
 */
export function toDisplay(conversion: DisplayConversion, texel: Vector3): Vector3 {
  return shownOf(conversion, exposureSignalOf(conversion, texel));
}

/**
 * The signal exposed back to light, its luminance rolled off with every channel scaled alike,
 * and encoded for the display.
 */
function tonedFrom(signal: Vector3, tone: ToneCurve): Vector3 {
  const light = mapRgb(signal, (channel) => tone.exposure * channel ** tone.exponent);
  const luminance = dotProduct(light, BT709_LUMINANCE);
  const scale = luminance > 0 ? rolledOff(luminance, tone) / luminance : 1;
  return mapRgb(light, (channel) => Math.min((channel * scale) ** (1 / tone.exponent), 1));
}

function rolledOff(luminance: number, tone: ToneCurve): number {
  const over = luminance - tone.kneeStart;
  return over <= 0
    ? luminance
    : tone.kneeStart + over / (1 + over / (tone.ceiling - tone.kneeStart));
}

function dotProduct(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function mapRgb([red, green, blue]: Vector3, map: (channel: number) => number): Vector3 {
  return [map(red), map(green), map(blue)];
}
