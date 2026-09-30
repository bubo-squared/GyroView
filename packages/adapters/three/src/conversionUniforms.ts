import {
  BT709_LUMINANCE,
  HLG_OETF,
  IDENTITY_MATRIX3,
  type DisplayConversion,
  type LensStitch,
} from '@gyroview/core';
import { Vector4, type IUniform, type Matrix3 } from 'three';

import { glslFloat } from './glslLiterals';
import { toThreeMatrix } from './threeMatrix';

/**
 * The kinds of conversion as the shader tells them apart; it shows any kind but HLG's as
 * recorded.
 */
const CONVERSION_AS_RECORDED = 0;
const CONVERSION_HLG_TO_SDR_BT709 = 1;

/**
 * The constants `displayConversion.glsl` refers to: HLG's kind, BT.2100 HLG's constants and
 * BT.709's luminance, from the core.
 */
export const CONVERSION_DEFINES: readonly (readonly [name: string, value: number | string])[] = [
  ['CONVERSION_HLG_TO_SDR_BT709', CONVERSION_HLG_TO_SDR_BT709],
  ['HLG_A', glslFloat(HLG_OETF.a)],
  ['HLG_B', glslFloat(HLG_OETF.b)],
  ['HLG_C', glslFloat(HLG_OETF.c)],
  ['HLG_SEGMENT_JOIN', glslFloat(HLG_OETF.segmentJoin)],
  ['HLG_SQUARE_SEGMENT_DIVISOR', glslFloat(HLG_OETF.squareSegmentDivisor)],
  ['HLG_LOG_SEGMENT_DIVISOR', glslFloat(HLG_OETF.logSegmentDivisor)],
  ['BT709_LUMINANCE_RED', glslFloat(BT709_LUMINANCE[0])],
  ['BT709_LUMINANCE_GREEN', glslFloat(BT709_LUMINANCE[1])],
  ['BT709_LUMINANCE_BLUE', glslFloat(BT709_LUMINANCE[2])],
];

/**
 * The uniforms of `displayConversion.glsl`, named exactly as there: how each lens's texels are
 * brought to the display (ADR 0033).
 */
export interface ConversionUniforms {
  readonly uLensConversion: IUniform<number[]>;
  readonly uLensMatrixCorrection: IUniform<Matrix3[]>;
  readonly uLensGamut: IUniform<Matrix3[]>;
  readonly uLensTone: IUniform<Vector4[]>;
}

export function conversionUniforms(lenses: readonly LensStitch[]): ConversionUniforms {
  const slots = lenses.map((lens) => conversionSlotOf(lens.displayConversion));
  return {
    uLensConversion: { value: slots.map((slot) => slot.kind) },
    uLensMatrixCorrection: { value: lenses.map(() => toThreeMatrix(IDENTITY_MATRIX3)) },
    uLensGamut: { value: slots.map((slot) => slot.gamut) },
    uLensTone: { value: slots.map((slot) => slot.tone) },
  };
}

interface ConversionSlot {
  readonly kind: number;
  readonly gamut: Matrix3;
  readonly tone: Vector4;
}

/**
 * Exhaustive over the conversion kinds: a new kind does not compile until it is packed. What a
 * kind does not use stays neutral: the identity gamut, a tone of zeros.
 */
function conversionSlotOf(conversion: DisplayConversion): ConversionSlot {
  switch (conversion.kind) {
    case 'as-recorded': {
      return {
        kind: CONVERSION_AS_RECORDED,
        gamut: toThreeMatrix(IDENTITY_MATRIX3),
        tone: new Vector4(),
      };
    }
    case 'hlg-to-sdr-bt709': {
      const { exposure, kneeStart, ceiling, exponent } = conversion.tone;
      return {
        kind: CONVERSION_HLG_TO_SDR_BT709,
        gamut: toThreeMatrix(conversion.gamut),
        tone: new Vector4(exposure, kneeStart, ceiling, exponent),
      };
    }
  }
}
