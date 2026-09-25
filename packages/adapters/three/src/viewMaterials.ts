import type { ViewMode } from '@gyroview/core';
import {
  Mesh,
  Scene,
  type BufferGeometry,
  type RawShaderMaterial,
  type WebGLRenderer,
} from 'three';

import { createPassMaterial, PASS_THROUGH_CAMERA } from './fullscreenPass';
import constants from './shaders/constants.glsl?raw';
import lensModels from './shaders/lensModels.glsl?raw';
import lensSampling from './shaders/lensSampling.glsl?raw';
import precision from './shaders/precision.glsl?raw';
import rawLensesFragment from './shaders/rawLenses.frag.glsl?raw';
import rays from './shaders/rays.glsl?raw';
import screenAreas from './shaders/screenAreas.glsl?raw';
import stitchFragment from './shaders/stitch.frag.glsl?raw';
import type { StitchUniforms } from './stitchUniforms';

/**
 * The shader program each view mode draws with: the stitch for the stitched modes, the raw
 * lenses pass for the unstitched one. All read the same uniform objects.
 */
export type ViewMaterials = Readonly<Record<ViewMode, RawShaderMaterial>>;

export function createViewMaterials(uniforms: StitchUniforms): ViewMaterials {
  const shared = [precision, constants, screenAreas];
  const stitch = createPassMaterial(uniforms, [
    ...shared,
    rays,
    lensModels,
    lensSampling,
    stitchFragment,
  ]);
  // The raw pass needs only the lens regions and textures, but lensSampling declares them.
  const rawLenses = createPassMaterial(uniforms, [
    ...shared,
    lensModels,
    lensSampling,
    rawLensesFragment,
  ]);
  return { normal: stitch, equirectangular: stitch, 'raw-lenses': rawLenses };
}

export function distinctMaterials(materials: ViewMaterials): RawShaderMaterial[] {
  return [...new Set(Object.values(materials))];
}

/**
 * Compiling every program now surfaces a broken shader here rather than at the first presented
 * frame or the first change of view mode.
 */
export function compileViewMaterials(
  renderer: WebGLRenderer,
  geometry: BufferGeometry,
  materials: ViewMaterials,
): void {
  for (const material of distinctMaterials(materials)) {
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));
    renderer.compile(scene, PASS_THROUGH_CAMERA);
  }
}
