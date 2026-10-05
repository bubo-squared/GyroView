import {
  type Matrix3 as CoreMatrix3,
  type SeamAlignment,
  type SeamMismatchMeter,
  type StitchingSetup,
} from '@gyroview/core';

import { LAB_SHADERS } from './labPrograms';
import { applySeamAlignment, createSeamJoinUniforms, type SeamJoinUniforms } from './seamJoin';
import { SeamMismatchPass } from './seamMismatch/SeamMismatchPass';
import { openRendererParts, type RendererParts } from '../rendererParts';
import { applyLensPose } from '../rendererUniforms';
import { ThreeFrameRenderer, type ThreeFrameRendererOptions } from '../ThreeFrameRenderer';

/**
 * The renderer `pnpm measure` draws with: the player's renderer, with the instruments the
 * measurements turn and read. Its stitch links the bent seam join (ADR 0026), which under the
 * fixed join draws what the player's stitch draws; the player never links this module.
 */
export class LabRenderer extends ThreeFrameRenderer {
  private constructor(
    parts: RendererParts,
    canvas: HTMLCanvasElement,
    private readonly join: SeamJoinUniforms,
  ) {
    super(parts, canvas);
  }

  public static override create(
    canvas: HTMLCanvasElement,
    setup: StitchingSetup,
    options: ThreeFrameRendererOptions = {},
  ): LabRenderer {
    const join = createSeamJoinUniforms();
    const pictures = { shaders: LAB_SHADERS, uniforms: { ...join } };
    return new this(openRendererParts(canvas, setup, { options, pictures }), canvas, join);
  }

  /**
   * Replaces one lens's body-to-lens rotation for every picture and meter from now on. Redraws the
   * frames on screen.
   */
  public setLensPose(lensIndex: number, rotation: CoreMatrix3): void {
    this.ensureLive();
    applyLensPose(this.uniforms, lensIndex, rotation);
    this.redraw();
  }

  /**
   * How the stitched pictures join the lenses at the seam, and the disparity a bent join bends
   * by. Redraws the frames on screen.
   */
  public setSeamAlignment(alignment: SeamAlignment): void {
    this.ensureLive();
    applySeamAlignment(this.join, alignment);
    this.redraw();
  }

  /**
   * A meter of how the lenses disagree along the seam strip of the frames on screen, for slides
   * of lens 0's sampling across the ring. Whoever creates it disposes it; the renderer disposes
   * any still live when it is disposed itself.
   */
  public createSeamMismatchMeter(): SeamMismatchMeter {
    this.ensureLive();
    const pass = new SeamMismatchPass(this.webgl, this.uniforms);
    return this.tracked({
      measure: (request) => pass.measure(request),
      dispose: () => {
        pass.dispose();
      },
    });
  }
}
