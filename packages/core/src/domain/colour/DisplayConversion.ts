import { transformVector, type Matrix3 } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import type { ColourPrimaries, TrackColour, TransferCharacteristics } from './TrackColour';

/**
 * A colour as a texel holds it, red, green and blue from 0 to 1, still encoded by the track's
 * transfer function.
 */
export type Rgb = Vector3;

/**
 * What a lens texture's texels hold once the browser has uploaded a decoded frame: it applies
 * the track's matrix and range, and leaves primaries and transfer as recorded (ADR 0033).
 */
export interface TexelSignal {
  readonly primaries: ColourPrimaries;
  readonly transfer: TransferCharacteristics;
}

/**
 * How linear light is brought to the display: an exposure gain, a roll-off above `kneeStart`
 * whose curve approaches `ceiling`, and the display's encoding power (BT.1886's 2.4, or less).
 */
export interface ToneCurve {
  readonly gain: number;
  readonly kneeStart: number;
  readonly ceiling: number;
  readonly exponent: number;
}

/**
 * A conversion as parameters a shader evaluates, one kind per strategy.
 */
export type DisplayConversionParameters =
  | { readonly kind: 'as-recorded' }
  | { readonly kind: 'hlg-to-sdr-bt709'; readonly gamut: Matrix3; readonly tone: ToneCurve };

/**
 * One way of showing a lens's texels on the SDR BT.709 display the player draws on, and the
 * texel signals it is for.
 */
export interface DisplayConversion {
  readonly parameters: DisplayConversionParameters;
  appliesTo(signal: TexelSignal): boolean;
}

const HDR_TRANSFERS: ReadonlySet<TransferCharacteristics> = new Set(['hlg', 'pq']);

/**
 * SDR as the browser uploads it: BT.709 and sRGB are close enough to show as recorded, as the
 * player always has; a track that names no transfer is taken for SDR.
 */
export const AS_RECORDED: DisplayConversion = {
  parameters: { kind: 'as-recorded' },
  appliesTo: (signal) => !HDR_TRANSFERS.has(signal.transfer),
};

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
 * Insta360 Studio's own HLG-to-SDR curve, fitted to the luma of the X6's HLG and Rec.709
 * exports of the same stitch: scene light, no OOTF, brought up by a quarter, rolled off above
 * 0.3 and encoded with a power of 1/2.2 (ADR 0033). Provisional until fitted per channel.
 */
const STUDIO_TONE: ToneCurve = { gain: 1.25, kneeStart: 0.3, ceiling: 1.35, exponent: 2.2 };

export const HLG_TO_SDR_BT709: DisplayConversion = {
  parameters: { kind: 'hlg-to-sdr-bt709', gamut: BT2020_TO_BT709, tone: STUDIO_TONE },
  appliesTo: (signal) => signal.transfer === 'hlg',
};

export const DISPLAY_CONVERSIONS: readonly DisplayConversion[] = [AS_RECORDED, HLG_TO_SDR_BT709];

/**
 * The conversion that shows texels of `signal`, none for one the player cannot show (PQ).
 */
export function displayConversionFor(signal: TexelSignal): DisplayConversion | undefined {
  return DISPLAY_CONVERSIONS.find((conversion) => conversion.appliesTo(signal));
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
 * A texel as the display shows it: the reference the shader's conversion is held to.
 */
export function toDisplay(parameters: DisplayConversionParameters, texel: Rgb): Rgb {
  switch (parameters.kind) {
    case 'as-recorded': {
      return texel;
    }
    case 'hlg-to-sdr-bt709': {
      const scene = mapRgb(texel, hlgInverseOetf);
      const inBt709 = transformVector(parameters.gamut, scene);
      return mapRgb(inBt709, (light) => encodedForDisplay(light, parameters.tone));
    }
  }
}

function encodedForDisplay(light: number, tone: ToneCurve): number {
  const exposed = Math.max(light, 0) * tone.gain;
  const over = exposed - tone.kneeStart;
  const rolledOff =
    over <= 0 ? exposed : tone.kneeStart + over / (1 + over / (tone.ceiling - tone.kneeStart));
  return Math.min(rolledOff ** (1 / tone.exponent), 1);
}

function mapRgb([red, green, blue]: Rgb, map: (channel: number) => number): Rgb {
  return [map(red), map(green), map(blue)];
}

/**
 * The conversion each decoded frame source is shown with, in frame-slot order, and what could not
 * be shown as it should.
 */
export interface DisplayConversionChoice {
  readonly conversions: readonly DisplayConversionParameters[];
  readonly warnings: readonly string[];
}

/**
 * Picks a conversion for each track's colour; a colour no conversion shows is drawn as recorded,
 * with a warning, rather than refused: the picture is there, its colours wrong.
 */
export function displayConversionsOf(colours: readonly TrackColour[]): DisplayConversionChoice {
  const found = colours.map((colour) => displayConversionFor(colour));
  const warnings = colours.flatMap((colour, slot) =>
    found[slot] === undefined
      ? [
          `frame source ${slot} is ${colour.transfer}, which the player cannot show yet: drawn as recorded`,
        ]
      : [],
  );
  return {
    conversions: found.map((conversion) => (conversion ?? AS_RECORDED).parameters),
    warnings,
  };
}
