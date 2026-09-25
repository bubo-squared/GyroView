import {
  clampView,
  DEFAULT_VIEW,
  DEFAULT_VIEW_MODE,
  ensureInvariant,
  GyroViewError,
  type Matrix3 as CoreMatrix3,
  seconds,
  type Presentation,
  type Seconds,
  type StabilizableFrameSink,
  type StitchingSetup,
  type Vector3 as CoreVector3,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';
import {
  LinearFilter,
  Mesh,
  NoColorSpace,
  Scene,
  VideoFrameTexture,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';

import { createFullscreenTriangle, PASS_THROUGH_CAMERA } from './fullscreenPass';
import { GainMatching } from './gainMatch/GainMatching';
import { GainMatchPass } from './gainMatch/GainMatchPass';
import {
  applyStabilization,
  applyView,
  createStitchUniforms,
  MAX_LENSES,
  type StitchUniforms,
} from './stitchUniforms';
import {
  compileViewMaterials,
  createViewMaterials,
  distinctMaterials,
  type ViewMaterials,
} from './viewMaterials';

export interface ThreeFrameRendererOptions {
  readonly view?: ViewState;
  readonly viewMode?: ViewMode;
  /**
   * Keep the drawing buffer after a frame so it can be read back or captured (tests, seam
   * inspection); costs a copy per frame, so off by default.
   */
  readonly preserveDrawingBuffer?: boolean;
}

interface RendererParts {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  /**
   * The fullscreen triangle; its material is the current view mode's program.
   */
  readonly pass: Mesh<BufferGeometry, ViewMaterials[ViewMode]>;
  readonly materials: ViewMaterials;
  readonly textures: readonly VideoFrameTexture[];
  readonly uniforms: StitchUniforms;
  readonly lensCount: number;
}

const RGBA_CHANNELS = 4;

/**
 * What the renderer starts drawing with.
 */
interface InitialDrawing {
  readonly view: ViewState;
  readonly viewMode: ViewMode;
}

/**
 * FrameSink over Three.js: uploads each lens frame to a texture and draws one fullscreen pass per
 * frame, laid out on the viewport as the view mode says: the stitched view of `stitch.frag.glsl`,
 * turned by the view and stabilization rotations, or the raw lens images side by side.
 */
export class ThreeFrameRenderer implements StabilizableFrameSink<VideoFrame> {
  private viewState: ViewState;
  private viewModeValue: ViewMode;
  /**
   * False until the first pair arrives and again after a context loss: the textures then hold
   * frames the session has closed, which must not be uploaded again.
   */
  private hasFrames = false;
  private isDisposed = false;
  private gainMatching: GainMatching | undefined;
  private lastMediaTime: Seconds = seconds(0);

  private constructor(
    private readonly parts: RendererParts,
    private readonly canvas: HTMLCanvasElement,
    initial: InitialDrawing,
  ) {
    this.viewState = clampView(initial.view);
    this.viewModeValue = initial.viewMode;
    this.applyView();
    canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  public static create(
    canvas: HTMLCanvasElement,
    setup: StitchingSetup,
    options: ThreeFrameRendererOptions = {},
  ): ThreeFrameRenderer {
    if (setup.lenses.length > MAX_LENSES) {
      throw new GyroViewError(
        'unsupported-layout',
        `the renderer draws at most ${MAX_LENSES} lenses, the layout has ${setup.lenses.length}`,
      );
    }
    const renderer = createRenderer(canvas, options.preserveDrawingBuffer ?? false);
    const textures = Array.from({ length: setup.frameCount }, () => createLensTexture());
    const uniforms = createStitchUniforms(setup, textures);
    const materials = createViewMaterials(uniforms);
    const viewMode = options.viewMode ?? DEFAULT_VIEW_MODE;
    const pass = new Mesh(createFullscreenTriangle(), materials[viewMode]);
    compileViewMaterials(renderer, pass.geometry, materials);
    const scene = new Scene();
    scene.add(pass);
    const lensCount = setup.lenses.length;
    const parts = { renderer, scene, pass, materials, textures, uniforms, lensCount };
    return new ThreeFrameRenderer(parts, canvas, { view: options.view ?? DEFAULT_VIEW, viewMode });
  }

  public get view(): ViewState {
    return this.viewState;
  }

  public get viewMode(): ViewMode {
    return this.viewModeValue;
  }

  public setView(view: ViewState): void {
    this.ensureLive();
    this.viewState = clampView(view);
    this.applyView();
    this.render();
  }

  public setViewMode(mode: ViewMode): void {
    this.ensureLive();
    this.viewModeValue = mode;
    this.parts.pass.material = this.parts.materials[mode];
    this.applyView();
    this.render();
  }

  /**
   * Per-channel multiplier for one lens: the hook for exposure matching and for inspecting a
   * single lens (gain zero on the other).
   */
  public setLensGain(lensIndex: number, gain: CoreVector3): void {
    this.ensureLive();
    this.parts.uniforms.uLensGain.value[lensIndex]?.set(...gain);
    this.render();
  }

  /**
   * Matches the lenses' exposure along the seam automatically, measuring every half second of
   * presented frames. Off by default; turning it off leaves the last gains in place.
   */
  public setGainMatching(isEnabled: boolean): void {
    this.ensureLive();
    if (!isEnabled) {
      this.gainMatching?.dispose();
      this.gainMatching = undefined;
      return;
    }
    this.gainMatching ??= new GainMatching(
      new GainMatchPass(this.parts.renderer, this.parts.uniforms, this.parts.textures.length),
      (gains) => {
        this.applyGains(gains);
      },
    );
  }

  /**
   * One measurement and adjustment right now, for tests and for a still frame.
   */
  public async matchGainsNow(): Promise<void> {
    this.ensureLive();
    await this.gainMatching?.matchNow(this.lastMediaTime);
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
    for (const [index, texture] of this.parts.textures.entries()) {
      const frame = frames[index];
      if (frame) texture.setFrame(frame.handle);
    }
    this.hasFrames = true;
    this.lastMediaTime = presentation.mediaTime;
    this.render();
    this.gainMatching?.afterPresent(presentation.mediaTime);
  }

  /**
   * Matches the drawing buffer to a new element size, in device pixels.
   */
  public resize(width: number, height: number): void {
    this.ensureLive();
    this.parts.renderer.setSize(width, height, false);
    this.applyView();
    this.render();
  }

  /**
   * The current drawing buffer as RGBA rows from the bottom up, for tests and inspection.
   */
  public readPixels(): Uint8ClampedArray {
    this.ensureLive();
    const gl = this.parts.renderer.getContext();
    const pixels = new Uint8ClampedArray(this.canvas.width * this.canvas.height * RGBA_CHANNELS);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.gainMatching?.dispose();
    for (const texture of this.parts.textures) texture.dispose();
    for (const material of distinctMaterials(this.parts.materials)) material.dispose();
    this.parts.pass.geometry.dispose();
    this.parts.renderer.dispose();
  }

  private readonly onContextLost = (): void => {
    this.hasFrames = false;
  };

  private render(): void {
    if (!this.hasFrames) return;
    this.parts.renderer.render(this.parts.scene, PASS_THROUGH_CAMERA);
  }

  private applyGains(gains: readonly CoreVector3[]): void {
    if (this.isDisposed) return;
    for (const [lensIndex, gain] of gains.entries()) {
      this.parts.uniforms.uLensGain.value[lensIndex]?.set(...gain);
    }
    this.render();
  }

  private applyView(): void {
    applyView(this.parts.uniforms, {
      view: this.viewState,
      mode: this.viewModeValue,
      viewportAspect: this.canvas.width / Math.max(this.canvas.height, 1),
      lensCount: this.parts.lensCount,
    });
  }

  private ensureLive(): void {
    ensureInvariant(!this.isDisposed, 'the renderer has been disposed');
  }
}

function createRenderer(
  canvas: HTMLCanvasElement,
  shouldPreserveDrawingBuffer: boolean,
): WebGLRenderer {
  // The context attributes must be given here: three keeps a context it is handed as it is.
  const context = canvas.getContext('webgl2', {
    preserveDrawingBuffer: shouldPreserveDrawingBuffer,
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
  });
  if (!context) {
    throw new GyroViewError('render-unavailable', 'this browser has no WebGL2 context');
  }
  const renderer = new WebGLRenderer({ canvas, context });
  renderer.setPixelRatio(1);
  renderer.debug.onShaderError = (gl, _program, ...shaders): void => {
    rejectShaders(gl, shaders);
  };
  return renderer;
}

/**
 * A shader that does not compile is a defect, not something to log and draw black over.
 */
function rejectShaders(gl: WebGLRenderingContext, shaders: readonly WebGLShader[]): never {
  const log = shaders
    .map((shader) => gl.getShaderInfoLog(shader))
    .filter(Boolean)
    .join('\n');
  throw new GyroViewError('render-unavailable', `the stitching shader did not compile: ${log}`);
}

function createLensTexture(): VideoFrameTexture {
  const texture = new VideoFrameTexture();
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
