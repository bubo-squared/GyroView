import {
  aspectOf,
  DEFAULT_FRAMING,
  DEFAULT_VIEW_MODE,
  ensureInvariant,
  type Framing,
  type PictureQuality,
  type Matrix3 as CoreMatrix3,
  type PictureRenderer,
  type Presentation,
  type SeamMeter,
  type StitchingSetup,
  type Vector3 as CoreVector3,
  shownAreaOf,
  viewModeRulesFor,
  type ViewMode,
  type ViewportSize,
} from '@gyroview/core';
import type { WebGLRenderer } from 'three';

import { applyTextureFilters, ensureUploadable } from './lensTextures';
import {
  compileAgain,
  openRendererParts,
  PLAYER_PICTURES,
  type RendererParts,
  type ThreeFrameRendererOptions,
} from './rendererParts';
import { SAMPLING_STRATEGIES } from './samplingStrategies';
import { scissorBoxOf } from './scissorBox';
import { SeamMeterPass } from './seamMeter/SeamMeterPass';
import {
  applyLensGain,
  applyPicture,
  applyShaderSampling,
  applyStabilization,
  type RendererUniforms,
} from './rendererUniforms';

export type { ThreeFrameRendererOptions } from './rendererParts';

/**
 * A meter this renderer made and disposes with itself unless disposed first.
 */
interface Meter {
  dispose(): void;
}

/**
 * PictureRenderer over Three.js: uploads each lens frame to a texture and draws one fullscreen pass
 * per frame, laid out on the viewport as the view mode's picture for the framing says: the
 * stitched sphere through `stitch.frag.glsl`, turned by the view and stabilization rotations, or
 * each lens image in a tile of its own.
 */
export class ThreeFrameRenderer implements PictureRenderer<VideoFrame> {
  private framing: Framing = DEFAULT_FRAMING;
  private viewMode: ViewMode = DEFAULT_VIEW_MODE;
  /**
   * False until the first pair arrives. The textures then hold the pair on screen, which the
   * session keeps open until it presents the next one.
   */
  private hasFrames = false;
  private isDisposed = false;
  private readonly meters = new Set<Meter>();

  protected constructor(
    private readonly parts: RendererParts,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.applyFraming();
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public static create(
    canvas: HTMLCanvasElement,
    setup: StitchingSetup,
    options: ThreeFrameRendererOptions = {},
  ): ThreeFrameRenderer {
    return new this(
      openRendererParts(canvas, setup, { options, pictures: PLAYER_PICTURES }),
      canvas,
    );
  }

  public get lensCount(): number {
    return this.parts.lensCount;
  }

  public setFraming(framing: Framing): void {
    this.ensureLive();
    this.framing = framing;
    this.applyFraming();
    this.redraw();
  }

  public setViewMode(mode: ViewMode): void {
    this.ensureLive();
    this.viewMode = mode;
    this.applyFraming();
    this.redraw();
  }

  /**
   * The frames standing on screen are uploaded again with the new filters and mip chain at the
   * next draw, so the change shows even while paused.
   */
  public setQuality(quality: PictureQuality): void {
    this.ensureLive();
    const strategy = SAMPLING_STRATEGIES[quality];
    for (const texture of this.parts.textures) {
      applyTextureFilters(texture, strategy);
      if (this.hasFrames) texture.needsUpdate = true;
    }
    applyShaderSampling(this.parts.uniforms, strategy);
    this.redraw();
  }

  public setLensGains(gains: readonly CoreVector3[]): void {
    this.ensureLive();
    for (const [lensIndex, gain] of gains.entries()) {
      applyLensGain(this.parts.uniforms, lensIndex, gain);
    }
    this.redraw();
  }

  /**
   * The meter leaves this renderer's list when disposed; the renderer disposes those still live
   * when it goes, since they share its context and uniforms.
   */
  public createSeamMeter(): SeamMeter {
    this.ensureLive();
    const pass = new SeamMeterPass(this.parts.renderer, this.parts.uniforms, this.parts.lensCount);
    return this.tracked({
      measure: () => pass.measure(),
      dispose: () => {
        pass.dispose();
      },
    });
  }

  /**
   * Turns the whole picture: the stabilized frame the viewer looks around in, into the body.
   * Does not redraw by itself: the stabilizing sink calls it right before presenting a pair.
   */
  public setStabilization(rotation: CoreMatrix3): void {
    this.ensureLive();
    applyStabilization(this.parts.uniforms, rotation);
  }

  public present(presentation: Presentation<VideoFrame>): void {
    this.ensureLive();
    const { frames } = presentation.pair;
    ensureInvariant(
      frames.length === this.parts.textures.length,
      `a pair of ${frames.length} frames does not fit ${this.parts.textures.length} lens textures`,
    );
    const { maxTextureSize } = this.parts.renderer.capabilities;
    for (const frame of frames) ensureUploadable(frame.handle, maxTextureSize);
    for (const [index, texture] of this.parts.textures.entries()) {
      const frame = frames[index];
      if (frame) texture.setFrame(frame.handle);
    }
    this.parts.matrixCorrections.follow(frames.map((frame) => frame.handle));
    this.hasFrames = true;
    this.drawNow();
  }

  /**
   * Matches the drawing buffer to a new element size, in device pixels.
   */
  public resize(size: ViewportSize): void {
    this.ensureLive();
    this.parts.renderer.setSize(size.width, size.height, false);
    this.applyFraming();
    // A new size clears the canvas: a draw left to the next frame would show it black until then.
    this.drawNow();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.parts.drawSchedule.cancel();
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    for (const meter of this.meters) meter.dispose();
    this.parts.built.dispose();
  }

  /**
   * The WebGL renderer and the shared uniforms, for a subclass's own passes and settings.
   */
  protected get webgl(): WebGLRenderer {
    return this.parts.renderer;
  }

  protected get uniforms(): RendererUniforms {
    return this.parts.uniforms;
  }

  /**
   * A meter over a pass that shares this renderer's context, which the renderer disposes with
   * itself unless it is disposed first.
   */
  protected tracked<M extends Meter>(meter: M): M {
    const kept: M = {
      ...meter,
      dispose: (): void => {
        this.meters.delete(kept);
        meter.dispose();
      },
    };
    this.meters.add(kept);
    return kept;
  }

  /**
   * Draws the picture again for a changed setting, when the draw schedule says.
   */
  protected redraw(): void {
    this.parts.drawSchedule.request(this.draw);
  }

  protected ensureLive(): void {
    ensureInvariant(!this.isDisposed, 'the renderer has been disposed');
  }

  /**
   * Three.js builds its state anew on a restored context but draws nothing: a paused picture
   * (iOS drops the context of a tab in the background) comes back only through a redraw, which
   * uploads the frames on screen again. Three's own listener, added when its renderer was made,
   * has rebuilt its state by now.
   */
  private readonly onContextRestored = (): void => {
    compileAgain(this.parts);
    this.redraw();
  };

  /**
   * Draws now what a draw asked for of the schedule would have drawn, which then has nothing left
   * to draw.
   */
  private drawNow(): void {
    this.parts.drawSchedule.cancel();
    this.draw();
  }

  /**
   * Clears the whole canvas, then draws the pass within the picture's scissor box only: the bars
   * of a panorama on a phone held upright are three quarters of it, and the stitch is the most
   * expensive pass. Fragments of a quad the box cuts still run as helpers, so the footprints'
   * derivatives stay defined (ADR 0024).
   */
  private readonly draw = (): void => {
    if (!this.hasFrames) return;
    const { renderer } = this.parts;
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    renderer.render(this.parts.scene, this.parts.camera);
  };

  /**
   * Asks the view mode what to draw for the framing on this canvas, and switches to that
   * picture's program.
   */
  private applyFraming(): void {
    const viewport = { width: this.canvas.width, height: this.canvas.height };
    const picture = viewModeRulesFor(this.viewMode).picture(this.framing, {
      viewport,
      lensCount: this.parts.lensCount,
    });
    this.parts.pass.material = this.parts.materials[picture.kind];
    applyPicture(this.parts.uniforms, picture, aspectOf(viewport));
    this.parts.renderer.setScissor(scissorBoxOf(shownAreaOf(picture), viewport));
  }
}
