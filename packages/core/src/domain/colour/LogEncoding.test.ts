import { describe, expect, it } from 'vitest';

import {
  LOG_CURVE_POINTS,
  logCurveLight,
  logCurveOf,
  logEncodingOf,
  X6_I_LOG_LUT,
} from './LogEncoding';

const PRECISION = 9;

function points(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

describe('logEncodingOf', () => {
  it("reads an X6 recording made in I-Log by the X6's fitted LUT", () => {
    expect(logEncodingOf({ model: 'Insta360 X6', captureMode: 'I_Log' })).toEqual({
      name: 'I-Log',
      lut: X6_I_LOG_LUT,
    });
  });

  it('gives no LUT for I-Log of a camera whose LUT is not fitted', () => {
    expect(logEncodingOf({ model: 'Insta360 X5', captureMode: 'I_Log' })?.lut).toBeUndefined();
    expect(logEncodingOf({ model: undefined, captureMode: 'I_Log' })?.lut).toBeUndefined();
  });

  it('finds no log encoding in a recording made in any other mode, or none named', () => {
    expect(logEncodingOf({ model: 'Insta360 X6', captureMode: 'standard' })).toBeUndefined();
    expect(logEncodingOf({ model: 'Insta360 X6', captureMode: undefined })).toBeUndefined();
  });
});

describe('logCurveOf', () => {
  it('refuses a curve of any count of points but the one the shader holds', () => {
    expect(logCurveOf(points(LOG_CURVE_POINTS)).log2Light).toHaveLength(LOG_CURVE_POINTS);
    expect(() => logCurveOf(points(LOG_CURVE_POINTS - 4))).toThrow(/13 points/u);
  });
});

describe('logCurveLight', () => {
  const curve = { log2Light: [-8, -4, 0] };

  it('reaches the light of each point', () => {
    expect(logCurveLight(curve, 0)).toBeCloseTo(2 ** -8, PRECISION);
    expect(logCurveLight(curve, 0.5)).toBeCloseTo(2 ** -4, PRECISION);
    expect(logCurveLight(curve, 1)).toBeCloseTo(1, PRECISION);
  });

  it('grows the light by a constant factor between two points', () => {
    expect(logCurveLight(curve, 0.25)).toBeCloseTo(2 ** -6, PRECISION);
    expect(logCurveLight(curve, 0.875)).toBeCloseTo(2 ** -1, PRECISION);
  });

  it('holds a signal outside 0 to 1 at black or white', () => {
    expect(logCurveLight(curve, -0.1)).toBe(logCurveLight(curve, 0));
    expect(logCurveLight(curve, 1.1)).toBe(logCurveLight(curve, 1));
  });

  it("has the X6's I-Log brighten with every step of its signal, up to white's light of one", () => {
    const { log2Light } = X6_I_LOG_LUT.curve;
    expect(logCurveLight(X6_I_LOG_LUT.curve, 1)).toBe(1);
    for (const [index, light] of log2Light.entries()) {
      if (index > 0) expect(light).toBeGreaterThan(log2Light[index - 1] ?? Infinity);
    }
  });
});

describe('X6_I_LOG_LUT', () => {
  it('keeps greys grey: each row of its matrix sums to one', () => {
    const { gamut } = X6_I_LOG_LUT;
    for (const row of [0, 1, 2]) {
      const sum = gamut.slice(row * 3, row * 3 + 3).reduce((total, value) => total + value, 0);
      expect(sum).toBeCloseTo(1, PRECISION);
    }
  });
});
