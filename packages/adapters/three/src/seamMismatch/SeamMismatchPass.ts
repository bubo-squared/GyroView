import {
  ensureIndexInRange,
  ensureInvariant,
  MISMATCH_CAP,
  SEAM_BIN_COUNT,
  type Matrix3 as CoreMatrix3,
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
import { compileAndProve } from '../compileAndProve';
import { createFullscreenTriangle, createPassMaterial } from '../fullscreenPass';
import { renderInto } from '../renderInto';
import { MAX_LENSES, type RendererUniforms } from '../rendererUniforms';
import { RGBA_CHANNELS } from '../seamMeter/rowMeans';
import { SEAM_MISMATCH } from '../shaderPrograms';

/**
 * Candidate poses measured in one draw and one read-back, the rows of the target: enough that a
 * coarse-to-fine search takes a handful of read-backs, few enough that each stays small.
 */
export const MAX_CANDIDATES_PER_BATCH = 256;
/**
 * A rotation travels to the GPU as three RGBA texels of a float texture, one column each.
 */
const MATRIX_COLUMNS = 3;
const MATRIX_ROWS = 3;
/**
 * The strip measures the disagreement between two lenses.
 */
const COMPARED_LENSES = 2;

/**
 * The stitch's uniforms plus what the mismatch program adds; the shared ones are the same
 * objects, so the meter always looks at the frames and the poses on screen.
 */
export interface SeamMismatchUniforms extends RendererUniforms {
  readonly uCandidateLens: IUniform<number>;
  readonly uCandidateCount: IUniform<number>;
  readonly uCandidates: IUniform<DataTexture>;
  readonly uMismatchGain: IUniform<Vector3[]>;
  readonly uMismatchCap: IUniform<number>;
}

export function createSeamMismatchUniforms(
  base: RendererUniforms,
  candidates: DataTexture,
): SeamMismatchUniforms {
  return {
    ...base,
    uCandidateLens: { value: 0 },
    uCandidateCount: { value: 0 },
    uCandidates: { value: candidates },
    uMismatchGain: { value: Array.from({ length: MAX_LENSES }, () => new Vector3(1, 1, 1)) },
    uMismatchCap: { value: MISMATCH_CAP },
  };
}

/**
 * SeamMismatchMeter over the GPU: renders the strip's bin costs for a batch of candidate poses
 * into one row each of a small target and reads them back, sharing the stitch's uniforms so it
 * measures the frames on screen. Compiled and proven when created, so a broken shader fails
 * there and not when a pose is first refined.
 */
export class SeamMismatchPass implements SeamMismatchMeter {
  private readonly candidateData = new Float32Array(
    MAX_CANDIDATES_PER_BATCH * MATRIX_COLUMNS * RGBA_CHANNELS,
  );
  private readonly candidates = new DataTexture(
    this.candidateData,
    MATRIX_COLUMNS,
    MAX_CANDIDATES_PER_BATCH,
    RGBAFormat,
    FloatType,
  );
  private readonly target = new WebGLRenderTarget(SEAM_BIN_COUNT, MAX_CANDIDATES_PER_BATCH, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  private readonly pixels = new Uint8Array(
    SEAM_BIN_COUNT * MAX_CANDIDATES_PER_BATCH * RGBA_CHANNELS,
  );
  private readonly uniforms: SeamMismatchUniforms;
  private readonly camera = new Camera();
  private readonly scene = new Scene();
  private readonly material: RawShaderMaterial;
  private readonly geometry: BufferGeometry = createFullscreenTriangle();
  private isDisposed = false;

  public constructor(
    private readonly renderer: WebGLRenderer,
    base: RendererUniforms,
    private readonly lensCount: number,
  ) {
    ensureInvariant(
      lensCount === COMPARED_LENSES,
      `the seam strip is measured between ${COMPARED_LENSES} lenses, not ${lensCount}`,
    );
    this.uniforms = createSeamMismatchUniforms(base, this.candidates);
    this.material = createPassMaterial(this.uniforms, SEAM_MISMATCH);
    this.scene.add(new Mesh(this.geometry, this.material));
    try {
      compileAndProve(renderer, this.scene, this.camera);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public async measure(request: SeamMismatchRequest): Promise<readonly SeamBinCosts[] | undefined> {
    this.apply(request);
    const costs: SeamBinCosts[] = [];
    try {
      for (let start = 0; start < request.rotations.length; start += MAX_CANDIDATES_PER_BATCH) {
        const batch = request.rotations.slice(start, start + MAX_CANDIDATES_PER_BATCH);
        await this.readBatch(batch);
        if (this.isDisposed) return undefined;
        costs.push(...decodeBinCosts(this.pixels, batch.length));
      }
    } catch (error) {
      // A lost context, or a disposal before or while reading back, fails the read-back; the
      // picture comes back with the context and a later frame measures again. Anything else is
      // a defect.
      if (this.isDisposed || this.renderer.getContext().isContextLost()) return undefined;
      throw error;
    }
    return costs;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.target.dispose();
    this.candidates.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }

  private apply(request: SeamMismatchRequest): void {
    ensureIndexInRange(request.lensIndex, this.lensCount, 'lens');
    ensureInvariant(
      request.gains.length === this.lensCount,
      `${request.gains.length} gains for ${this.lensCount} lenses`,
    );
    this.uniforms.uCandidateLens.value = request.lensIndex;
    for (const [lensIndex, gain] of request.gains.entries()) {
      this.uniforms.uMismatchGain.value[lensIndex]?.set(...gain);
    }
  }

  private async readBatch(rotations: readonly CoreMatrix3[]): Promise<void> {
    this.writeCandidates(rotations);
    this.uniforms.uCandidateCount.value = rotations.length;
    renderInto(this.renderer, this.target, () => {
      this.renderer.render(this.scene, this.camera);
    });
    await this.renderer.readRenderTargetPixelsAsync(
      this.target,
      0,
      0,
      SEAM_BIN_COUNT,
      rotations.length,
      this.pixels,
    );
  }

  /**
   * Column by column, as GLSL builds a matrix from its columns: texel `c` of row `k` is column
   * `c` of candidate `k`, the core's row-major matrix read down its columns.
   */
  private writeCandidates(rotations: readonly CoreMatrix3[]): void {
    for (const [candidate, matrix] of rotations.entries()) {
      for (let column = 0; column < MATRIX_COLUMNS; column += 1) {
        const offset = (candidate * MATRIX_COLUMNS + column) * RGBA_CHANNELS;
        for (let row = 0; row < MATRIX_ROWS; row += 1) {
          this.candidateData[offset + row] = matrix[row * MATRIX_COLUMNS + column] ?? 0;
        }
        this.candidateData[offset + MATRIX_ROWS] = 0;
      }
    }
    this.candidates.needsUpdate = true;
  }
}
