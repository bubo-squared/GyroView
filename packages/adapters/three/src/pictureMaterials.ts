import type { PictureKind } from '@gyroview/core';
import {
  Camera,
  Mesh,
  Scene,
  WebGLRenderTarget,
  type BufferGeometry,
  type RawShaderMaterial,
  type WebGLRenderer,
} from 'three';

import { createPassMaterial } from './fullscreenPass';
import { renderInto } from './renderInto';
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
 * Draws every program once, off screen: a broken shader then fails here rather than at the first
 * presented frame or the first change of view mode (three checks a program only at its first
 * use, which `compile` is not), and a change of mode is instant.
 */
export function compilePictureMaterials(
  renderer: WebGLRenderer,
  geometry: BufferGeometry,
  materials: PictureMaterials,
): void {
  const camera = new Camera();
  const scenes = Object.values(materials).map((material) => {
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));
    return scene;
  });
  const target = new WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
  try {
    renderInto(renderer, target, () => {
      for (const scene of scenes) renderer.render(scene, camera);
    });
  } finally {
    target.dispose();
  }
}

export function disposePictureMaterials(materials: PictureMaterials): void {
  for (const material of Object.values(materials)) material.dispose();
}
