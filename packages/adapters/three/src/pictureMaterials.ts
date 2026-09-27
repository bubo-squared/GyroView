import type { PictureKind } from '@gyroview/core';
import {
  Camera,
  Mesh,
  Scene,
  type BufferGeometry,
  type RawShaderMaterial,
  type WebGLRenderer,
} from 'three';

import { compileAndProve } from './compileAndProve';
import { createPassMaterial } from './fullscreenPass';
import type { RendererUniforms } from './rendererUniforms';
import { PICTURE_PROGRAMS } from './shaderPrograms';

/**
 * The program each kind of picture is drawn with; all read the same uniform objects.
 */
export type PictureMaterials = Readonly<Record<PictureKind, RawShaderMaterial>>;

export function createPictureMaterials(uniforms: RendererUniforms): PictureMaterials {
  return {
    rectilinear: createPassMaterial(uniforms, PICTURE_PROGRAMS.rectilinear),
    equirectangular: createPassMaterial(uniforms, PICTURE_PROGRAMS.equirectangular),
    'lens-tiles': createPassMaterial(uniforms, PICTURE_PROGRAMS['lens-tiles']),
  };
}

/**
 * Compiles and proves every program now: a broken shader then fails here rather than at the first
 * presented frame or the first change of view mode, and a change of mode is instant.
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
    compileAndProve(renderer, scene, camera);
  }
}

export function disposePictureMaterials(materials: PictureMaterials): void {
  for (const material of Object.values(materials)) material.dispose();
}
