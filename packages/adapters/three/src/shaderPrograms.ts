import type { PictureKind } from '@gyroview/core';

import analysisFragment from './shaders/analysis.frag.glsl?raw';
import equirectangularRays from './shaders/equirectangularRays.glsl?raw';
import header from './shaders/header.glsl?raw';
import lensModels from './shaders/lensModels.glsl?raw';
import lensSampling from './shaders/lensSampling.glsl?raw';
import lensTextures from './shaders/lensTextures.glsl?raw';
import rawLensesFragment from './shaders/rawLenses.frag.glsl?raw';
import rectilinearRays from './shaders/rectilinearRays.glsl?raw';
import screenAreas from './shaders/screenAreas.glsl?raw';
import seamMismatchFragment from './shaders/seamMismatch.frag.glsl?raw';
import stitchFragment from './shaders/stitch.frag.glsl?raw';

/**
 * The fragment programs, each the GLSL chunks it is made of in the order they must appear: a
 * chunk comes after every chunk whose declarations it uses. The only place that order is known.
 */
const LENS_PROJECTION = [lensTextures, lensModels, lensSampling];

function stitchThrough(rays: string): readonly string[] {
  return [header, screenAreas, rays, ...LENS_PROJECTION, stitchFragment];
}

/**
 * The program each kind of picture is drawn with.
 */
export const PICTURE_PROGRAMS: Readonly<Record<PictureKind, readonly string[]>> = {
  rectilinear: stitchThrough(rectilinearRays),
  equirectangular: stitchThrough(equirectangularRays),
  'lens-tiles': [header, screenAreas, lensTextures, rawLensesFragment],
};

export const SEAM_ANALYSIS = [header, ...LENS_PROJECTION, analysisFragment];

/**
 * The seam strip's disagreement between the lenses for candidate poses of one of them.
 */
export const SEAM_MISMATCH = [header, ...LENS_PROJECTION, seamMismatchFragment];

/**
 * Every chunk of every program once, for checking them against the TypeScript side.
 */
export const ALL_CHUNKS: readonly string[] = [
  ...new Set([...Object.values(PICTURE_PROGRAMS).flat(), ...SEAM_ANALYSIS, ...SEAM_MISMATCH]),
];
