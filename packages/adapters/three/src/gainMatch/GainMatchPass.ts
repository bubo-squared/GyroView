import type { Vector3 } from '@gyroview/core';
import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  GLSL3,
  Mesh,
  RawShaderMaterial,
  Scene,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

import { rowMeansOf } from './rowMeans';
import analysisFragment from '../shaders/analysis.frag.glsl?raw';
import constants from '../shaders/constants.glsl?raw';
import fullscreenVertex from '../shaders/fullscreen.vert.glsl?raw';
import lensModels from '../shaders/lensModels.glsl?raw';
import lensSampling from '../shaders/lensSampling.glsl?raw';
import precision from '../shaders/precision.glsl?raw';
import { MAX_LENSES, SHADER_DEFINES, type StitchUniforms } from '../stitchUniforms';

/**
 * Samples taken around the seam ring per lens: enough to average out content, few enough that
 * the read-back is negligible.
 */
export const SEAM_SAMPLES = 64;
const RGBA = 4;
const BEYOND_CLIP = 3;
const FULLSCREEN_TRIANGLE = [-1, -1, 0, BEYOND_CLIP, -1, 0, -1, BEYOND_CLIP, 0];
const POSITION_COMPONENTS = 3;
const PASS_THROUGH_CAMERA = new Camera();

/**
 * Renders what each lens sees along the seam ring into one row of a tiny target and reads the
 * rows back, sharing the stitch's uniforms so it always looks at the frames on screen.
 */
export class GainMatchPass {
  private readonly target = new WebGLRenderTarget(SEAM_SAMPLES, MAX_LENSES, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  private readonly pixels = new Uint8Array(SEAM_SAMPLES * MAX_LENSES * RGBA);
  private readonly scene = new Scene();
  private readonly material: RawShaderMaterial;
  private readonly geometry = new BufferGeometry();

  public constructor(
    private readonly renderer: WebGLRenderer,
    uniforms: StitchUniforms,
    private readonly lensCount: number,
  ) {
    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      defines: { ...SHADER_DEFINES },
      vertexShader: fullscreenVertex,
      fragmentShader: [precision, constants, lensModels, lensSampling, analysisFragment].join('\n'),
      uniforms: { ...uniforms },
      depthTest: false,
      depthWrite: false,
    });
    this.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(FULLSCREEN_TRIANGLE, POSITION_COMPONENTS),
    );
    this.scene.add(new Mesh(this.geometry, this.material));
  }

  /**
   * Mean colour (0..1) each lens shows along the seam, or undefined when a lens images none of it.
   */
  public async measure(): Promise<readonly Vector3[] | undefined> {
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, PASS_THROUGH_CAMERA);
    this.renderer.setRenderTarget(previousTarget);
    await this.renderer.readRenderTargetPixelsAsync(
      this.target,
      0,
      0,
      SEAM_SAMPLES,
      MAX_LENSES,
      this.pixels,
    );
    return rowMeansOf(this.pixels, SEAM_SAMPLES, this.lensCount);
  }

  public dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}
