import {
  degreesToRadians,
  ensureInvariant,
  SEAM_BEND_WIDTH,
  SEAM_BIN_COUNT,
  SEAM_BIN_WIDTH,
  SEAM_CUT_DISPARITY,
  SEAM_CUT_HALF_WIDTH,
  SEAM_MAX_BEND,
  type SeamAlignment,
  type SeamJoin,
} from '@gyroview/core';
import { Vector4, type IUniform } from 'three';

const SEAM_JOIN_FIXED = 0;
const SEAM_JOIN_BENT = 1;
const SEAM_JOIN_CUT = 2;
const JOIN_CODES: Readonly<Record<SeamJoin, number>> = {
  fixed: SEAM_JOIN_FIXED,
  bent: SEAM_JOIN_BENT,
  cut: SEAM_JOIN_CUT,
};
/**
 * The bins' disparities travel four to a `vec4`, which keeps the uniform array within the
 * vectors every WebGL 2 fragment shader has.
 */
const BINS_PER_VECTOR = 4;

/**
 * The constants `seamJoin.glsl` refers to, as preprocessor defines.
 */
export const SEAM_JOIN_DEFINES: readonly (readonly [string, number])[] = [
  ['SEAM_JOIN_BENT', SEAM_JOIN_BENT],
  ['SEAM_JOIN_CUT', SEAM_JOIN_CUT],
  ['SEAM_BIN_COUNT', SEAM_BIN_COUNT],
  ['SEAM_BIN_WIDTH_RADIANS', degreesToRadians(SEAM_BIN_WIDTH)],
  ['SEAM_BEND_WIDTH_RADIANS', degreesToRadians(SEAM_BEND_WIDTH)],
  ['SEAM_CUT_HALF_WIDTH_RADIANS', degreesToRadians(SEAM_CUT_HALF_WIDTH)],
  ['SEAM_CUT_DISPARITY_RADIANS', degreesToRadians(SEAM_CUT_DISPARITY)],
  ['SEAM_MAX_BEND_RADIANS', degreesToRadians(SEAM_MAX_BEND)],
];

export interface SeamJoinUniforms {
  readonly uSeamJoin: IUniform<number>;
  readonly uSeamDisparity: IUniform<Vector4[]>;
}

/**
 * The fixed join, no disparity anywhere.
 */
export function createSeamJoinUniforms(): SeamJoinUniforms {
  return {
    uSeamJoin: { value: SEAM_JOIN_FIXED },
    uSeamDisparity: {
      value: Array.from({ length: SEAM_BIN_COUNT / BINS_PER_VECTOR }, () => new Vector4()),
    },
  };
}

export function applySeamAlignment(uniforms: SeamJoinUniforms, alignment: SeamAlignment): void {
  ensureInvariant(
    alignment.disparities.length === SEAM_BIN_COUNT,
    `${alignment.disparities.length} disparities for ${SEAM_BIN_COUNT} seam bins`,
  );
  uniforms.uSeamJoin.value = JOIN_CODES[alignment.join];
  for (const [bin, disparity] of alignment.disparities.entries()) {
    const vector = uniforms.uSeamDisparity.value[Math.floor(bin / BINS_PER_VECTOR)];
    vector?.setComponent(bin % BINS_PER_VECTOR, degreesToRadians(disparity));
  }
}
