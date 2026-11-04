import { ensureInvariant } from '../../shared/errors/GyroViewError';
import { clamp } from '../../shared/math/clamp';
import type { Matrix3 } from '../../shared/math/Matrix3';

/**
 * A log encoding's scene light at even steps of its signal from 0 to 1, as log2 of the light,
 * white's light 1 as HLG's is, so an exposure signal of it fits the seam meter's 8 bits: between
 * two steps the log of the light is interpolated, so the light grows by a constant factor along
 * each step, as a log encoding's does.
 */
export interface LogCurve {
  readonly log2Light: readonly number[];
}

/**
 * The points every log curve has, the signal in sixteenths: as many as the shader holds a lens.
 */
export const LOG_CURVE_POINTS = 17;

/**
 * A log curve of {@link LOG_CURVE_POINTS} points: a curve fitted at another count would pass
 * every test of the core and then fail as the renderer packs it.
 */
export function logCurveOf(log2Light: readonly number[]): LogCurve {
  ensureInvariant(
    log2Light.length === LOG_CURVE_POINTS,
    `a log curve of ${log2Light.length} points, where every curve has ${LOG_CURVE_POINTS}`,
  );
  return { log2Light };
}

/**
 * Insta360 Studio's LUT for one camera's log encoding, fitted to the camera's recordings through
 * Studio's own tone curve (ADR 0033, ADR 0047): the encoding's curve to scene light, the matrix
 * that takes that light into BT.709, its rows summing to one so greys stay grey, and the exposure
 * that brings the light up before the tone curve, as the tone curve's own exposure brings HLG's.
 */
export interface FittedLut {
  readonly curve: LogCurve;
  readonly gamut: Matrix3;
  readonly exposure: number;
}

/**
 * How a camera records light in a log mode while its bitstream names an SDR transfer (ADR 0047),
 * and Studio's LUT for it where one is fitted for the camera.
 */
export interface LogEncoding {
  readonly name: string;
  readonly lut: FittedLut | undefined;
}

/**
 * The X6's I-Log LUT, fitted pixel by pixel to one recording's plain and LUT exports of the same
 * stitch (ADR 0047). Its matrix is close to BT.2087's from BT.2020, I-Log's primaries as Insta360
 * specifies them. The signal was seen from 0.14 to 0.82: the last three points carry on the slope
 * fitted at its top, on the few highlights the scene held, where the slopes below fall steadily,
 * and how Studio draws a brighter highlight is not measured.
 */
/* eslint-disable @typescript-eslint/no-magic-numbers -- fitted values, cited above */
export const X6_I_LOG_LUT: FittedLut = {
  curve: logCurveOf([
    -19.215, -15.998, -12.781, -10.301, -8.487, -6.923, -5.676, -4.676, -3.859, -3.139, -2.49,
    -1.951, -1.55, -1.249, -0.833, -0.416, 0,
  ]),
  gamut: [1.6224, -0.5134, -0.109, -0.1462, 1.2776, -0.1314, -0.0673, 0.0327, 1.0346],
  exposure: 3.625,
};
/* eslint-enable @typescript-eslint/no-magic-numbers */

/**
 * The info record's capture mode of a recording made in I-Log, as the X6 writes it.
 */
const I_LOG_CAPTURE_MODE = 'I_Log';

/**
 * Keyed by the whole model name, as the IMU frames are: a camera's I-Log LUT is fitted against
 * Studio's exports of that camera's recordings (ADR 0047), never assumed from another's.
 */
const I_LOG_LUTS_BY_MODEL: ReadonlyMap<string, FittedLut> = new Map([
  ['Insta360 X6', X6_I_LOG_LUT],
]);

/**
 * What the info record says about the camera, as far as its log mode depends on it.
 */
export interface LogEncodingHints {
  readonly model: string | undefined;
  readonly captureMode: string | undefined;
}

/**
 * The log encoding a recording was made in, by its info record: I-Log, which the camera's
 * bitstream calls BT.709; nothing for a recording in no log mode.
 */
export function logEncodingOf(info: LogEncodingHints): LogEncoding | undefined {
  return info.captureMode?.trim() === I_LOG_CAPTURE_MODE
    ? { name: 'I-Log', lut: I_LOG_LUTS_BY_MODEL.get(info.model?.trim() ?? '') }
    : undefined;
}

/**
 * Scene light of a log signal from 0 to 1, by its curve.
 */
export function logCurveLight(curve: LogCurve, signal: number): number {
  const steps = curve.log2Light.length - 1;
  const position = clamp(signal, 0, 1) * steps;
  const step = Math.min(Math.floor(position), steps - 1);
  const below = curve.log2Light[step] ?? NaN;
  const above = curve.log2Light[step + 1] ?? NaN;
  return 2 ** (below + (above - below) * (position - step));
}
