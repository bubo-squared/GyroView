import {
  HLG_OETF,
  IDENTITY_MATRIX3,
  type DisplayConversionParameters,
  type LensStitch,
} from '@gyroview/core';
import { Vector4, type IUniform, type Matrix3 } from 'three';

import { toThreeMatrix } from './threeMatrix';

const CONVERSION_AS_RECORDED = 0;
const CONVERSION_HLG_TO_SDR_BT709 = 1;

/**
 * The constants `displayConversion.glsl` refers to: the conversion kinds and BT.2100 HLG's, from
 * the core.
 */
export const CONVERSION_DEFINES: readonly (readonly [name: string, value: number])[] = [
  ['CONVERSION_AS_RECORDED', CONVERSION_AS_RECORDED],
  ['CONVERSION_HLG_TO_SDR_BT709', CONVERSION_HLG_TO_SDR_BT709],
  ['HLG_A', HLG_OETF.a],
  ['HLG_B', HLG_OETF.b],
  ['HLG_C', HLG_OETF.c],
  ['HLG_SEGMENT_JOIN', HLG_OETF.segmentJoin],
  ['HLG_SQUARE_SEGMENT_DIVISOR', HLG_OETF.squareSegmentDivisor],
  ['HLG_LOG_SEGMENT_DIVISOR', HLG_OETF.logSegmentDivisor],
];

/**
 * The uniforms of `displayConversion.glsl`, named exactly as there: how each lens's texels are
 * brought to the display (ADR 0033).
 */
export interface ConversionUniforms {
  readonly uLensConversion: IUniform<number[]>;
  readonly uLensGamut: IUniform<Matrix3[]>;
  readonly uLensTone: IUniform<Vector4[]>;
}

export function conversionUniforms(lenses: readonly LensStitch[]): ConversionUniforms {
  const slots = lenses.map((lens) => conversionSlotOf(lens.displayConversion));
  return {
    uLensConversion: { value: slots.map((slot) => slot.kind) },
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
 * A tone the as-recorded kind never reads: gain 1, no roll-off before its ceiling, encoding 1.
 */
const UNREAD_TONE = new Vector4(1, 1, 2, 1);

/**
 * Exhaustive over the conversion kinds: a new kind does not compile until it is packed. What a
 * kind does not use stays neutral.
 */
function conversionSlotOf(parameters: DisplayConversionParameters): ConversionSlot {
  switch (parameters.kind) {
    case 'as-recorded': {
      return {
        kind: CONVERSION_AS_RECORDED,
        gamut: toThreeMatrix(IDENTITY_MATRIX3),
        tone: UNREAD_TONE,
      };
    }
    case 'hlg-to-sdr-bt709': {
      const { gain, kneeStart, ceiling, exponent } = parameters.tone;
      return {
        kind: CONVERSION_HLG_TO_SDR_BT709,
        gamut: toThreeMatrix(parameters.gamut),
        tone: new Vector4(gain, kneeStart, ceiling, exponent),
      };
    }
  }
}
