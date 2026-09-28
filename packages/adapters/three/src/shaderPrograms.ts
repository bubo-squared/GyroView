import type { PictureKind } from '@gyroview/core';

import analysisFragment from './shaders/analysis.frag.glsl?raw';
import equirectangularRays from './shaders/equirectangularRays.glsl?raw';
import fixedJoin from './shaders/fixedJoin.glsl?raw';
import header from './shaders/header.glsl?raw';
import lensModels from './shaders/lensModels.glsl?raw';
import lensSampling from './shaders/lensSampling.glsl?raw';
import lensTextures from './shaders/lensTextures.glsl?raw';
import rawLensesFragment from './shaders/rawLenses.frag.glsl?raw';
import rectilinearRays from './shaders/rectilinearRays.glsl?raw';
import screenAreas from './shaders/screenAreas.glsl?raw';
import stitchFragment from './shaders/stitch.frag.glsl?raw';

/**
 * The fragment programs, each the GLSL chunks it is made of in the order they must appear: a
 * chunk comes after every chunk whose declarations it uses. The only place that order is known.
 */
const LENS_PROJECTION = [lensTextures, lensModels, lensSampling];

/**
 * A program that reads the lenses through their calibration, ending in `fragment`.
 */
export function lensProjectionProgram(fragment: string): readonly string[] {
  return [header, ...LENS_PROJECTION, fragment];
}

/**
 * The program each kind of picture is drawn with.
 */
export type PicturePrograms = Readonly<Record<PictureKind, readonly string[]>>;

/**
 * The picture programs with a seam join chunk: `fixedJoin.glsl` for the player, or one that
 * implements its three functions otherwise.
 */
export function pictureProgramsWith(seamJoin: string): PicturePrograms {
  const stitchThrough = (rays: string): readonly string[] => [
    header,
    screenAreas,
    rays,
    ...LENS_PROJECTION,
    seamJoin,
    stitchFragment,
  ];
  return {
    rectilinear: stitchThrough(rectilinearRays),
    equirectangular: stitchThrough(equirectangularRays),
    'lens-tiles': [header, screenAreas, lensTextures, rawLensesFragment],
  };
}

export const PICTURE_PROGRAMS = pictureProgramsWith(fixedJoin);

export const SEAM_ANALYSIS = lensProjectionProgram(analysisFragment);

/**
 * Every chunk of the given programs once, for checking them against the TypeScript side.
 */
export function chunksOf(programs: readonly (readonly string[])[]): readonly string[] {
  return [...new Set(programs.flat())];
}

export const ALL_CHUNKS = chunksOf([...Object.values(PICTURE_PROGRAMS), SEAM_ANALYSIS]);
