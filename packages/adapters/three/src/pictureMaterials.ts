import type { PictureKind } from '@gyroview/core';
import {
  Camera,
  Mesh,
  Scene,
  type BufferGeometry,
  type RawShaderMaterial,
  type WebGLRenderer,
} from 'three';

import { createPassMaterial } from './fullscreenPass';
import type { RendererUniforms } from './rendererUniforms';
import { EQUIRECTANGULAR_STITCH, LENS_TILES, RECTILINEAR_STITCH } from './shaderPrograms';

/**
 * The program each kind of picture is drawn with; all read the same uniform objects.
 */
export type PictureMaterials = Readonly<Record<PictureKind, RawShaderMaterial>>;

export function createPictureMaterials(uniforms: RendererUniforms): PictureMaterials {
  return {
    rectilinear: createPassMaterial(uniforms, RECTILINEAR_STITCH),
    equirectangular: createPassMaterial(uniforms, EQUIRECTANGULAR_STITCH),
    'lens-tiles': createPassMaterial(uniforms, LENS_TILES),
  };
}

/**
 * Compiling every program now surfaces a broken shader here rather than at the first presented
 * frame or the first change of view mode, and makes a change of mode instant.
 */
export function compilePictureMaterials(
  renderer: WebGLRenderer,
  geometry: BufferGeometry,
  materials: PictureMaterials,
): void {
  const camera = new Camera();
  for (const material of Object.values(materials)) {
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));
    renderer.compile(scene, camera);
  }
}

export function disposePictureMaterials(materials: PictureMaterials): void {
  for (const material of Object.values(materials)) material.dispose();
}
