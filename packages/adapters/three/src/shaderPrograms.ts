import analysisFragment from './shaders/analysis.frag.glsl?raw';
import constants from './shaders/constants.glsl?raw';
import equirectangularRays from './shaders/equirectangularRays.glsl?raw';
import lensModels from './shaders/lensModels.glsl?raw';
import lensSampling from './shaders/lensSampling.glsl?raw';
import lensTextures from './shaders/lensTextures.glsl?raw';
import precision from './shaders/precision.glsl?raw';
import rawLensesFragment from './shaders/rawLenses.frag.glsl?raw';
import rectilinearRays from './shaders/rectilinearRays.glsl?raw';
import screenAreas from './shaders/screenAreas.glsl?raw';
import stitchFragment from './shaders/stitch.frag.glsl?raw';

/**
 * The fragment programs, each the GLSL chunks it is made of in the order they must appear: a
 * chunk comes after every chunk whose declarations it uses. The only place that order is known.
 */
const HEADER = [precision, constants];
const LENS_PROJECTION = [lensTextures, lensModels, lensSampling];

function stitchThrough(rays: string): readonly string[] {
  return [...HEADER, screenAreas, rays, ...LENS_PROJECTION, stitchFragment];
}

export const RECTILINEAR_STITCH = stitchThrough(rectilinearRays);
export const EQUIRECTANGULAR_STITCH = stitchThrough(equirectangularRays);
export const LENS_TILES = [...HEADER, screenAreas, lensTextures, rawLensesFragment];
export const SEAM_ANALYSIS = [...HEADER, ...LENS_PROJECTION, analysisFragment];

/**
 * Every chunk once, for checking the uniforms they declare against the TypeScript side.
 */
export const ALL_CHUNKS: readonly string[] = [
  ...new Set([...RECTILINEAR_STITCH, ...EQUIRECTANGULAR_STITCH, ...LENS_TILES, ...SEAM_ANALYSIS]),
];
