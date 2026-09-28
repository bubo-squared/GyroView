import {
  degreesToRadians,
  SEAM_BIN_COLUMNS,
  SEAM_CELL_SUBSAMPLES,
  SEAM_STRIP_ROWS,
  SEAM_STRIP_STEP,
  SEAM_STRIP_THETA_START,
} from '@gyroview/core';

import { MISMATCH_ENCODING_DEFINES } from './seamMismatch/decodeBinCosts';
import { SEAM_JOIN_DEFINES } from './seamJoin';
import bentJoin from './shaders/bentJoin.glsl?raw';
import seamMismatchFragment from './shaders/seamMismatch.frag.glsl?raw';
import type { PictureProgramSet } from '../pictureMaterials';
import { SHADER_DEFINES } from '../rendererUniforms';
import { chunksOf, lensProjectionProgram, pictureProgramsWith } from '../shaderPrograms';

/**
 * The constants of the seam strip the mismatch program samples.
 */
const SEAM_STRIP_DEFINES: readonly (readonly [string, number])[] = [
  ['SEAM_STRIP_ROWS', SEAM_STRIP_ROWS],
  ['SEAM_BIN_COLUMNS', SEAM_BIN_COLUMNS],
  ['SEAM_CELL_SUBSAMPLES', SEAM_CELL_SUBSAMPLES],
  ['SEAM_STRIP_STEP_RADIANS', degreesToRadians(SEAM_STRIP_STEP)],
  ['SEAM_STRIP_THETA_START_RADIANS', degreesToRadians(SEAM_STRIP_THETA_START)],
];

/**
 * Every constant the lab's programs refer to: the player's, and the seam join's and seam strip's.
 */
export const LAB_DEFINES: Readonly<Record<string, number>> = {
  ...SHADER_DEFINES,
  ...Object.fromEntries([
    ...SEAM_JOIN_DEFINES,
    ...SEAM_STRIP_DEFINES,
    ...MISMATCH_ENCODING_DEFINES,
  ]),
};

/**
 * The pictures the lab draws: the stitch through the bent seam join, whose fixed join draws what
 * the player draws.
 */
export const LAB_PICTURES: PictureProgramSet = {
  programs: pictureProgramsWith(bentJoin),
  defines: LAB_DEFINES,
};

/**
 * The seam strip's disagreement between the lenses for slides of lens 0's sampling.
 */
export const SEAM_MISMATCH = lensProjectionProgram(seamMismatchFragment);

/**
 * Every chunk of the lab's programs once, for checking them against the TypeScript side.
 */
export const LAB_CHUNKS = chunksOf([...Object.values(LAB_PICTURES.programs), SEAM_MISMATCH]);
