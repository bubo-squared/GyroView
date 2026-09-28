import {
  degreesToRadians,
  ensureInvariant,
  MISMATCH_CAP,
  SEAM_BIN_COUNT,
  type SeamBinCosts,
  type SeamMismatchMeter,
  type SeamMismatchRequest,
} from '@gyroview/core';
import {
  Camera,
  DataTexture,
  FloatType,
  Mesh,
  RGBAFormat,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type BufferGeometry,
  type IUniform,
  type RawShaderMaterial,
  type WebGLRenderer,
} from 'three';

import { decodeBinCosts } from './decodeBinCosts';
import { compileAndProve } from '../../compileAndProve';
import { createFullscreenTriangle, createPassMaterial } from '../../fullscreenPass';
import { renderInto } from '../../renderInto';
import { MAX_LENSES, type RendererUniforms } from '../../rendererUniforms';
import { RGBA_CHANNELS } from '../../seamMeter/rowMeans';
import { LAB_DEFINES, SEAM_MISMATCH } from '../labPrograms';

/**
 * The most slides one measurement takes, one row of the target each: the disparity range's 57
 * with room to spare, few enough that the read-back stays small.
 */
export const MAX_SLIDES = 256;
/**
 * The strip measures the disagreement between two lenses.
 */
const COMPARED_LENSES = 2;

/**
 * The stitch's uniforms plus what the mismatch program adds; the shared ones are the same
 * objects, so the meter always looks at the frames and the poses on screen.
 */
export interface SeamMismatchUniforms extends RendererUniforms {
  readonly uSlideCount: IUniform<number>;
  readonly uSlides: IUniform<DataTexture>;
  readonly uMismatchGain: IUniform<Vector3[]>;
  readonly uMismatchCap: IUniform<number>;
}

export function createSeamMismatchUniforms(
  base: RendererUniforms,
  slides: DataTexture,
): SeamMismatchUniforms {
  return {
    ...base,
    uSlideCount: { value: 0 },
    uSlides: { value: slides },
    uMismatchGain: { value: Array.from({ length: MAX_LENSES }, () => new Vector3(1, 1, 1)) },
    uMismatchCap: { value: MISMATCH_CAP },
  };
}

/**
 * SeamMismatchMeter over the GPU: renders the strip's bin costs for every slide of lens 0 into
 * one row each of a small target and reads them back, sharing the stitch's uniforms so it
 * measures the frames on screen. Compiled and proven when created, so a broken shader fails
 * there and not at the first measurement.
 */
export class SeamMismatchPass implements SeamMismatchMeter {
  private readonly slideData = new Float32Array(MAX_SLIDES * RGBA_CHANNELS);
  private readonly slides = new DataTexture(this.slideData, 1, MAX_SLIDES, RGBAFormat, FloatType);
  private readonly target = new WebGLRenderTarget(SEAM_BIN_COUNT, MAX_SLIDES, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  private readonly uniforms: SeamMismatchUniforms;
  private readonly camera = new Camera();
  private readonly scene = new Scene();
  private readonly material: RawShaderMaterial;
  private readonly geometry: BufferGeometry = createFullscreenTriangle();
  private isDisposed = false;

  public constructor(
    private readonly renderer: WebGLRenderer,
    base: RendererUniforms,
  ) {
    ensureInvariant(
      base.uLensCount.value === COMPARED_LENSES,
      `the seam strip is measured between ${COMPARED_LENSES} lenses, not ${base.uLensCount.value}`,
    );
    this.uniforms = createSeamMismatchUniforms(base, this.slides);
    this.material = createPassMaterial(this.uniforms, {
      chunks: SEAM_MISMATCH,
      defines: LAB_DEFINES,
    });
    this.scene.add(new Mesh(this.geometry, this.material));
    try {
      compileAndProve(renderer, this.scene, this.camera);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public async measure(request: SeamMismatchRequest): Promise<readonly SeamBinCosts[] | undefined> {
    if (this.isDisposed) return undefined;
    this.apply(request);
    const count = request.disparities.length;
    // Each measurement reads into its own pixels: one started while another reads back must not
    // overwrite what the other decodes.
    const pixels = new Uint8Array(SEAM_BIN_COUNT * count * RGBA_CHANNELS);
    try {
      renderInto(this.renderer, this.target, () => {
        this.renderer.render(this.scene, this.camera);
      });
      await this.renderer.readRenderTargetPixelsAsync(
        this.target,
        0,
        0,
        SEAM_BIN_COUNT,
        count,
        pixels,
      );
    } catch (error) {
      // A lost context, or a disposal before or while reading back, fails the read-back; the
      // picture comes back with the context and a later frame measures again. Anything else is
      // a defect.
      if (this.hasBeenDisposed() || this.renderer.getContext().isContextLost()) return undefined;
      throw error;
    }
    return this.hasBeenDisposed() ? undefined : decodeBinCosts(pixels, count);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.target.dispose();
    this.slides.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }

  /**
   * Whether the pass has been disposed by now: it can be while a measurement waits for the
   * read-back, which the narrowing of the field after the first look does not know.
   */
  private hasBeenDisposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Each slide's angle, in radians, in the first channel of its row's texel; the gains per lens.
   */
  private apply(request: SeamMismatchRequest): void {
    const { disparities, gains } = request;
    ensureInvariant(
      disparities.length > 0 && disparities.length <= MAX_SLIDES,
      `${disparities.length} slides, where one measurement takes 1 to ${MAX_SLIDES}`,
    );
    ensureInvariant(
      gains.length === COMPARED_LENSES,
      `${gains.length} gains for ${COMPARED_LENSES} lenses`,
    );
    for (const [row, disparity] of disparities.entries()) {
      this.slideData[row * RGBA_CHANNELS] = degreesToRadians(disparity);
    }
    this.slides.needsUpdate = true;
    this.uniforms.uSlideCount.value = disparities.length;
    for (const [lensIndex, gain] of gains.entries()) {
      this.uniforms.uMismatchGain.value[lensIndex]?.set(...gain);
    }
  }
}
