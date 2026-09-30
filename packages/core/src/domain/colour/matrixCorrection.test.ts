import { describe, expect, it } from 'vitest';

import { matrixCorrectionOf } from './matrixCorrection';
import { IDENTITY_MATRIX3, transformVector } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';

const PRECISION = 9;

/**
 * R′G′B′ of Y′, Pb and Pr through a matrix of the given luma weights, as a platform derives it.
 */
function rgbThrough(red: number, blue: number, [y, pb, pr]: Vector3): Vector3 {
  const r = y + 2 * (1 - red) * pr;
  const b = y + 2 * (1 - blue) * pb;
  return [r, (y - red * r - blue * b) / (1 - red - blue), b];
}

describe('matrixCorrectionOf', () => {
  it('brings R′G′B′ a platform derived through BT.709 to what BT.2020 gives', () => {
    const signal: Vector3 = [0.69, 0.076, -0.415];
    const decodedAs709 = rgbThrough(0.2126, 0.0722, signal);
    const corrected = transformVector(matrixCorrectionOf('bt2020-ncl', 'bt709'), decodedAs709);
    const recorded = rgbThrough(0.2627, 0.0593, signal);
    for (const [channel, value] of corrected.entries()) {
      expect(value).toBeCloseTo(recorded[channel] ?? NaN, PRECISION);
    }
  });

  it('leaves greys grey', () => {
    const corrected = transformVector(
      matrixCorrectionOf('bt2020-ncl', 'smpte170m'),
      [0.4, 0.4, 0.4],
    );
    for (const value of corrected) expect(value).toBeCloseTo(0.4, PRECISION);
  });

  it('corrects nothing where the matrices agree or one is not known', () => {
    expect(matrixCorrectionOf('bt709', 'bt709')).toBe(IDENTITY_MATRIX3);
    expect(matrixCorrectionOf('unspecified', 'bt709')).toBe(IDENTITY_MATRIX3);
    expect(matrixCorrectionOf('bt2020-ncl', 'rgb')).toBe(IDENTITY_MATRIX3);
  });
});
