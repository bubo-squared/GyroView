import type { SeamMeter, Vector3 } from '@gyroview/core';
import {
  Camera,
  Mesh,
  Scene,
  WebGLRenderTarget,
  type BufferGeometry,
  type RawShaderMaterial,
  type WebGLRenderer,
} from 'three';

import { rowMeansOf } from './rowMeans';
import { compileAndProve } from '../compileAndProve';
import { createFullscreenTriangle, createPassMaterial } from '../fullscreenPass';
import { RGBA_CHANNELS } from './rowMeans';
import { renderInto } from '../renderInto';
import { MAX_LENSES, type RendererUniforms } from '../rendererUniforms';
import { SEAM_ANALYSIS } from '../shaderPrograms';

/**
 * Samples taken around the seam ring per lens: enough to average out content, few enough that
 * the read-back is negligible.
 */
const SEAM_SAMPLES = 64;

/**
 * SeamMeter over the GPU: renders what each lens sees along the seam ring into one row of a tiny
 * target and reads the rows back, sharing the stitch's uniforms so it always looks at the frames
 * on screen. Compiled and proven when created, so a broken shader fails there and not
 * mid-playback.
 */
export class SeamMeterPass implements SeamMeter {
  private readonly target = new WebGLRenderTarget(SEAM_SAMPLES, MAX_LENSES, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  private readonly pixels = new Uint8Array(SEAM_SAMPLES * MAX_LENSES * RGBA_CHANNELS);
  private readonly camera = new Camera();
  private readonly scene = new Scene();
  private readonly material: RawShaderMaterial;
  private readonly geometry: BufferGeometry = createFullscreenTriangle();
  private isDisposed = false;

  public constructor(
    private readonly renderer: WebGLRenderer,
    uniforms: RendererUniforms,
    private readonly lensCount: number,
  ) {
    this.material = createPassMaterial(uniforms, SEAM_ANALYSIS);
    this.scene.add(new Mesh(this.geometry, this.material));
    try {
      compileAndProve(renderer, this.scene, this.camera);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /**
   * Mean colour (0..1) each lens shows along the seam, or undefined when a lens images none of it.
   */
  public async measure(): Promise<readonly Vector3[] | undefined> {
    try {
      await this.readSeam();
    } catch (error) {
      // A lost context, or a disposal before or while reading back, fails the read-back; the
      // picture comes back with the context and a later frame measures again. Anything else is
      // a defect.
      if (this.isDisposed || this.renderer.getContext().isContextLost()) return undefined;
      throw error;
    }
    return this.isDisposed ? undefined : rowMeansOf(this.pixels, SEAM_SAMPLES, this.lensCount);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.target.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }

  /**
   * Renders the seam rows into the meter's target, the renderer's own target restored however the
   * drawing ends.
   */
  private draw(): void {
    renderInto(this.renderer, this.target, () => {
      this.renderer.render(this.scene, this.camera);
    });
  }

  private async readSeam(): Promise<void> {
    this.draw();
    await this.renderer.readRenderTargetPixelsAsync(
      this.target,
      0,
      0,
      SEAM_SAMPLES,
      MAX_LENSES,
      this.pixels,
    );
  }
}
