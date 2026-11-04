import { describe, expect, it } from 'vitest';

import {
  AS_RECORDED,
  displayConversionsOf,
  exposureSignalOf,
  HLG_OETF,
  HLG_TO_SDR_BT709,
  hlgInverseOetf,
  shownOf,
  toDisplay,
  X6_I_LOG_TO_SDR_BT709,
} from './DisplayConversion';
import { logCurveLight, logEncodingOf } from './LogEncoding';
import { UNSPECIFIED_COLOUR, type TrackColour } from './TrackColour';
import { IDENTITY_MATRIX3 } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';

const PRECISION = 6;

const HLG: TrackColour = {
  primaries: 'bt2020',
  transfer: 'hlg',
  matrix: 'bt2020-ncl',
  range: 'limited',
};
const SDR: TrackColour = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', range: 'full' };
/**
 * What the X6's bitstream says of an I-Log recording.
 */
const I_LOG_AS_TAGGED: TrackColour = { ...SDR, range: 'limited' };
const X6_I_LOG = logEncodingOf({ model: 'Insta360 X6', captureMode: 'I_Log' });

function conversionOf(primaries: TrackColour['primaries']): unknown {
  return displayConversionsOf([{ ...HLG, primaries }], undefined).conversions[0];
}

function grey(level: number): Vector3 {
  return [level, level, level];
}

/**
 * The HLG signal of scene light (BT.2100 OETF), the inverse of `hlgInverseOetf`, to paint lenses
 * of known exposure.
 */
function hlgOetf(light: number): number {
  const { a, b, c, segmentJoin, squareSegmentDivisor, logSegmentDivisor } = HLG_OETF;
  const joinLight = (segmentJoin * segmentJoin) / squareSegmentDivisor;
  return light <= joinLight
    ? Math.sqrt(squareSegmentDivisor * light)
    : a * Math.log(logSegmentDivisor * light - b) + c;
}

describe('hlgInverseOetf', () => {
  it('reaches the BT.2100 points: half signal a twelfth of scene light, full signal all of it', () => {
    expect(hlgInverseOetf(0)).toBe(0);
    expect(hlgInverseOetf(0.5)).toBeCloseTo(1 / 12, PRECISION);
    expect(hlgInverseOetf(1)).toBeCloseTo(1, PRECISION);
  });

  it('joins its square-root and logarithmic segments at half signal', () => {
    const below = hlgInverseOetf(0.5 - 1e-9);
    const above = hlgInverseOetf(0.5 + 1e-9);
    expect(above - below).toBeLessThan(1e-7);
  });
});

describe('displayConversionsOf', () => {
  it('picks each frame source its conversion, in order', () => {
    expect(displayConversionsOf([HLG, SDR], undefined)).toEqual({
      conversions: [HLG_TO_SDR_BT709, { ...AS_RECORDED, matrix: 'bt709' }],
      warnings: [],
    });
  });

  it("keeps each track's matrix, which the renderer brings the texels back to", () => {
    const matrices = displayConversionsOf(
      [
        { ...SDR, matrix: 'smpte170m' },
        { ...HLG, matrix: 'unspecified' },
      ],
      undefined,
    ).conversions.map((conversion) => conversion.matrix);
    expect(matrices).toEqual(['smpte170m', 'unspecified']);
  });

  it('shows every SDR transfer, or none named, as recorded', () => {
    const transfers = ['bt709', 'smpte170m', 'iec61966-2-1', 'unspecified'] as const;
    const colours = transfers.map((transfer) => ({ ...UNSPECIFIED_COLOUR, transfer }));
    expect(displayConversionsOf(colours, undefined)).toEqual({
      conversions: transfers.map(() => AS_RECORDED),
      warnings: [],
    });
  });

  it('brings HLG into BT.709 by its primaries, taking BT.2100 ones where it names none', () => {
    expect(conversionOf('bt2020')).toEqual(HLG_TO_SDR_BT709);
    expect(conversionOf('unspecified')).toEqual(HLG_TO_SDR_BT709);
    expect(conversionOf('bt709')).toEqual({ ...HLG_TO_SDR_BT709, gamut: IDENTITY_MATRIX3 });
  });

  it('says so when it shows HLG without its gamut', () => {
    const choice = displayConversionsOf([{ ...HLG, primaries: 'smpte432' }], undefined);
    expect(choice.conversions).toEqual([{ ...HLG_TO_SDR_BT709, gamut: IDENTITY_MATRIX3 }]);
    expect(choice.warnings).toEqual(['HLG of smpte432 primaries is shown without their gamut']);
  });

  it('says so when it shows SDR of wider primaries as BT.709', () => {
    const choice = displayConversionsOf([{ ...SDR, primaries: 'bt2020' }], undefined);
    expect(choice.conversions).toEqual([{ ...AS_RECORDED, matrix: 'bt709' }]);
    expect(choice.warnings).toEqual(['bt2020 primaries are shown as BT.709']);
  });

  it("shows I-Log, which the bitstream calls BT.709, by the camera's fitted LUT", () => {
    expect(displayConversionsOf([I_LOG_AS_TAGGED, I_LOG_AS_TAGGED], X6_I_LOG)).toEqual({
      conversions: [X6_I_LOG_TO_SDR_BT709, X6_I_LOG_TO_SDR_BT709],
      warnings: [],
    });
  });

  it('keeps a track the bitstream names HLG as HLG, whatever the info record says', () => {
    expect(displayConversionsOf([HLG], X6_I_LOG).conversions).toEqual([HLG_TO_SDR_BT709]);
  });

  it("draws I-Log as recorded where the camera's LUT is not fitted, and says so once", () => {
    const unmeasured = logEncodingOf({ model: 'Insta360 X5', captureMode: 'I_Log' });
    const choice = displayConversionsOf([I_LOG_AS_TAGGED, I_LOG_AS_TAGGED], unmeasured);
    expect(choice.conversions).toEqual([
      { ...AS_RECORDED, matrix: 'bt709' },
      { ...AS_RECORDED, matrix: 'bt709' },
    ]);
    expect(choice.warnings).toEqual([
      'I-Log of this camera is shown as recorded: its LUT is not fitted',
    ]);
  });

  it('draws a transfer it cannot show as recorded, and says so once for all its tracks', () => {
    const pq: TrackColour = { ...HLG, transfer: 'pq' };
    const choice = displayConversionsOf([pq, pq, { ...SDR, transfer: 'linear' }], undefined);
    expect(choice.conversions.map((conversion) => conversion.kind)).toEqual([
      'as-recorded',
      'as-recorded',
      'as-recorded',
    ]);
    expect(choice.warnings).toEqual([
      'the pq transfer cannot be shown yet: drawn as recorded',
      'the linear transfer cannot be shown yet: drawn as recorded',
    ]);
  });
});

describe('toDisplay', () => {
  it('leaves a colour shown as recorded untouched', () => {
    expect(toDisplay(AS_RECORDED, [0.1, 0.5, 0.9])).toEqual([0.1, 0.5, 0.9]);
  });

  it('keeps greys grey through the HLG conversion', () => {
    for (const level of [0.1, 0.4, 0.75, 1]) {
      const [red, green, blue] = toDisplay(HLG_TO_SDR_BT709, grey(level));
      expect(green).toBeCloseTo(red, PRECISION);
      expect(blue).toBeCloseTo(red, PRECISION);
    }
  });

  it('brightens greys monotonically, black staying black', () => {
    const levels = Array.from({ length: 21 }, (_, index) => index / 20);
    const shown = levels.map((level) => toDisplay(HLG_TO_SDR_BT709, grey(level))[0]);
    expect(shown[0]).toBe(0);
    for (const [index, value] of shown.entries()) {
      if (index > 0) expect(value).toBeGreaterThan(shown[index - 1] ?? Infinity);
    }
  });

  it("draws greys where Insta360 Studio's SDR export does, within two hundredths", () => {
    // HLG signal, and the median luma of Studio's SDR export over the near-grey pixels of that
    // signal in its HLG export, three frames of one recording (ADR 0033). The top highlight, a
    // few dozen pixels, is drawn about two levels dark: a refit will move it first.
    const studio: readonly (readonly [number, number])[] = [
      [0.2, 0.168],
      [0.35, 0.27],
      [0.5, 0.379],
      [0.65, 0.512],
      [0.8, 0.681],
      [0.95, 0.88],
    ];
    for (const [signal, sdr] of studio) {
      const [shown] = toDisplay(HLG_TO_SDR_BT709, grey(signal));
      expect(Math.abs(shown - sdr)).toBeLessThan(0.02);
    }
  });

  it('keeps greys grey through the I-Log conversion, brightening them up to white', () => {
    const levels = Array.from({ length: 21 }, (_, index) => index / 20);
    const shown = levels.map((level) => toDisplay(X6_I_LOG_TO_SDR_BT709, grey(level)));
    for (const [index, [red, green, blue]] of shown.entries()) {
      expect(green).toBeCloseTo(red, PRECISION);
      expect(blue).toBeCloseTo(red, PRECISION);
      const previous = shown[index - 1]?.[0];
      if (previous !== undefined && previous < 1) expect(red).toBeGreaterThan(previous);
    }
    expect(shown.at(-1)?.[0]).toBe(1);
  });

  it("draws I-Log greys where Insta360 Studio's I-Log LUT does, within two hundredths", () => {
    // I-Log signal, and the median luma of Studio's LUT export over the near-grey pixels of that
    // signal in its plain export, five frames of one recording (ADR 0047). At 0.8, a few dozen
    // pixels, the conversion draws some five levels dark.
    const studio: readonly (readonly [number, number])[] = [
      [0.2, 0.081],
      [0.3, 0.185],
      [0.4, 0.348],
      [0.5, 0.539],
      [0.6, 0.713],
      [0.7, 0.855],
    ];
    for (const [signal, lut] of studio) {
      const [shown] = toDisplay(X6_I_LOG_TO_SDR_BT709, grey(signal));
      expect(Math.abs(shown - lut)).toBeLessThan(0.02);
    }
  });

  it('keeps the hue of a colour whose highlights roll off: its channels stay in proportion', () => {
    const { exposure, exponent } = HLG_TO_SDR_BT709.tone;
    const shown = shownOf(HLG_TO_SDR_BT709, [0.9, 0.6, 0.3]);
    const light = (channel: number): number => channel ** exponent;
    expect(light(shown[1]) / light(shown[0])).toBeCloseTo(light(0.6) / light(0.9), PRECISION);
    expect(light(shown[2]) / light(shown[0])).toBeCloseTo(light(0.3) / light(0.9), PRECISION);
    // Rolled off below what the exposure alone would show.
    expect(shown[0]).toBeLessThan(0.9 * exposure ** (1 / exponent));
  });

  it('brings a BT.2020 primary into BT.709 as far as it reaches, never below black', () => {
    for (const conversion of [HLG_TO_SDR_BT709, X6_I_LOG_TO_SDR_BT709]) {
      const shown = toDisplay(conversion, [0, 1, 0]);
      expect(shown.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      expect(shown[1]).toBeGreaterThan(shown[0]);
    }
  });
});

describe('exposureSignalOf', () => {
  it('is the texel itself for a lens shown as recorded', () => {
    expect(exposureSignalOf(AS_RECORDED, [0.2, 0.4, 0.6])).toEqual([0.2, 0.4, 0.6]);
    expect(shownOf(AS_RECORDED, [0.2, 0.4, 0.6])).toEqual([0.2, 0.4, 0.6]);
  });

  it('reads an HLG signal past white as white, the most light the signal encodes', () => {
    // A matrix correction can lift a saturated channel a little past one.
    expect(exposureSignalOf(HLG_TO_SDR_BT709, [0, 0, 1.02])).toEqual(
      exposureSignalOf(HLG_TO_SDR_BT709, [0, 0, 1]),
    );
  });

  it("reads I-Log as its curve's light, raised to the display's power", () => {
    const { curve, tone } = X6_I_LOG_TO_SDR_BT709;
    for (const signal of [0.25, 0.5, 0.75]) {
      const [red] = exposureSignalOf(X6_I_LOG_TO_SDR_BT709, grey(signal));
      expect(red).toBeCloseTo(logCurveLight(curve, signal) ** (1 / tone.exponent), PRECISION);
    }
  });

  it('matches two HLG lenses a stop apart with one gain, in the shadows and the highlights', () => {
    for (const light of [0.02, 0.4]) {
      const brighter = exposureSignalOf(HLG_TO_SDR_BT709, grey(hlgOetf(light)));
      const darker = exposureSignalOf(HLG_TO_SDR_BT709, grey(hlgOetf(light / 2)));
      const gain = brighter[0] / darker[0];
      expect(gain).toBeCloseTo(2 ** (1 / HLG_TO_SDR_BT709.tone.exponent), PRECISION);
      const matched = shownOf(HLG_TO_SDR_BT709, grey(darker[0] * gain));
      expect(matched[0]).toBeCloseTo(shownOf(HLG_TO_SDR_BT709, brighter)[0], PRECISION);
    }
  });
});
