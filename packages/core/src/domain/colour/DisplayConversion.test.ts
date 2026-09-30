import { describe, expect, it } from 'vitest';

import {
  AS_RECORDED,
  displayConversionFor,
  displayConversionsOf,
  HLG_TO_SDR_BT709,
  hlgInverseOetf,
  toDisplay,
  type Rgb,
  type TexelSignal,
} from './DisplayConversion';

const HLG: TexelSignal = { primaries: 'bt2020', transfer: 'hlg' };
const PRECISION = 6;

function grey(level: number): Rgb {
  return [level, level, level];
}

describe('hlgInverseOetf', () => {
  it('reaches the BT.2100 points: half signal a twelfth of scene light, full signal all of it', () => {
    expect(hlgInverseOetf(0)).toBe(0);
    expect(hlgInverseOetf(0.5)).toBeCloseTo(1 / 12, PRECISION);
    expect(hlgInverseOetf(1)).toBeCloseTo(1, 6);
  });

  it('joins its square-root and logarithmic segments at half signal', () => {
    const below = hlgInverseOetf(0.5 - 1e-9);
    const above = hlgInverseOetf(0.5 + 1e-9);
    expect(above - below).toBeLessThan(1e-7);
  });
});

describe('displayConversionFor', () => {
  it('shows every SDR or unspecified transfer as recorded', () => {
    for (const transfer of ['bt709', 'smpte170m', 'iec61966-2-1', 'unspecified'] as const) {
      expect(displayConversionFor({ primaries: 'bt709', transfer })).toBe(AS_RECORDED);
    }
  });

  it('converts HLG to SDR BT.709', () => {
    expect(displayConversionFor(HLG)).toBe(HLG_TO_SDR_BT709);
  });

  it('has no conversion for a transfer it cannot show, such as PQ', () => {
    expect(displayConversionFor({ primaries: 'bt2020', transfer: 'pq' })).toBeUndefined();
  });
});

describe('toDisplay', () => {
  it('leaves a colour shown as recorded untouched', () => {
    expect(toDisplay(AS_RECORDED.parameters, [0.1, 0.5, 0.9])).toEqual([0.1, 0.5, 0.9]);
  });

  it('keeps greys grey through the HLG conversion', () => {
    for (const level of [0.1, 0.4, 0.75, 1]) {
      const [red, green, blue] = toDisplay(HLG_TO_SDR_BT709.parameters, grey(level));
      expect(green).toBeCloseTo(red, PRECISION);
      expect(blue).toBeCloseTo(red, PRECISION);
    }
  });

  it('brightens greys monotonically, black staying black', () => {
    const levels = Array.from({ length: 21 }, (_, index) => index / 20);
    const shown = levels.map((level) => toDisplay(HLG_TO_SDR_BT709.parameters, grey(level))[0]);
    expect(shown[0]).toBe(0);
    for (const [index, value] of shown.entries()) {
      if (index > 0) expect(value).toBeGreaterThan(shown[index - 1] ?? Infinity);
    }
  });

  it("draws greys where Insta360 Studio's SDR export does, within two hundredths", () => {
    // HLG signal and Studio's SDR signal, the medians of three frames (ADR 0033).
    const studio: readonly (readonly [number, number])[] = [
      [0.2, 0.16],
      [0.35, 0.26],
      [0.5, 0.365],
      [0.65, 0.489],
      [0.8, 0.658],
      [0.95, 0.858],
    ];
    for (const [signal, sdr] of studio) {
      const [shown] = toDisplay(HLG_TO_SDR_BT709.parameters, grey(signal));
      expect(Math.abs(shown - sdr)).toBeLessThan(0.02);
    }
  });

  it('brings a BT.2020 primary into BT.709 as far as it reaches, never below black', () => {
    const shown = toDisplay(HLG_TO_SDR_BT709.parameters, [0, 1, 0]);
    expect(shown.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(shown[1]).toBeGreaterThan(shown[0]);
  });
});

describe('displayConversionsOf', () => {
  it('picks each frame source its conversion, in order', () => {
    const sdr = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', range: 'full' } as const;
    const hlg = {
      primaries: 'bt2020',
      transfer: 'hlg',
      matrix: 'bt2020-ncl',
      range: 'limited',
    } as const;
    expect(displayConversionsOf([hlg, sdr])).toEqual({
      conversions: [HLG_TO_SDR_BT709.parameters, AS_RECORDED.parameters],
      warnings: [],
    });
  });

  it('draws a colour it cannot show as recorded, and says so', () => {
    const pq = {
      primaries: 'bt2020',
      transfer: 'pq',
      matrix: 'bt2020-ncl',
      range: 'limited',
    } as const;
    const choice = displayConversionsOf([pq]);
    expect(choice.conversions).toEqual([AS_RECORDED.parameters]);
    expect(choice.warnings).toEqual([expect.stringContaining('pq') as string]);
  });
});
