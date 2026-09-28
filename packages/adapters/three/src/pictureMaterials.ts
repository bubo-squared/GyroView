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
import { SHADER_DEFINES, type RendererUniforms } from './rendererUniforms';
import { PICTURE_PROGRAMS, type PicturePrograms } from './shaderPrograms';

/**
 * The material each kind of picture is drawn with; all read the same uniform objects.
 */
export type PictureMaterials = Readonly<Record<PictureKind, RawShaderMaterial>>;

/**
 * The picture programs a renderer draws with and the constants they refer to.
 */
export interface PictureProgramSet {
  readonly programs: PicturePrograms;
  readonly defines: Readonly<Record<string, number>>;
}

/**
 * The pictures the player draws: the stitch through the fixed seam join.
 */
export const PLAYER_PICTURES: PictureProgramSet = {
  programs: PICTURE_PROGRAMS,
  defines: SHADER_DEFINES,
};

/**
 * The pictures' materials over the shared uniforms, and any the pictures' programs add.
 */
export function createPictureMaterials(
  uniforms: RendererUniforms,
  pictures: PictureProgramSet,
): PictureMaterials {
  const materialOf = (kind: PictureKind): RawShaderMaterial =>
    createPassMaterial(uniforms, { chunks: pictures.programs[kind], defines: pictures.defines });
  return {
    rectilinear: materialOf('rectilinear'),
    equirectangular: materialOf('equirectangular'),
    'lens-tiles': materialOf('lens-tiles'),
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
