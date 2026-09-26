import {
  DEFAULT_FRAMING,
  DEFAULT_VIEW_MODE,
  ensureInvariant,
  GyroViewError,
  type Framing,
  type Matrix3 as CoreMatrix3,
  type PictureRenderer,
  type Presentation,
  type SeamMeter,
  type StitchingSetup,
  type Vector3 as CoreVector3,
  viewModeRulesFor,
  type ViewMode,
} from '@gyroview/core';
import {
  Camera,
  LinearFilter,
  Mesh,
  NoColorSpace,
  Scene,
  VideoFrameTexture,
  WebGLRenderer,
  type BufferGeometry,
  type RawShaderMaterial,
} from 'three';

import { createFullscreenTriangle } from './fullscreenPass';
import { SeamMeterPass } from './seamMeter/SeamMeterPass';
import {
  compilePictureMaterials,
  createPictureMaterials,
  disposePictureMaterials,
  type PictureMaterials,
} from './pictureMaterials';
import { RGBA_CHANNELS } from './readback';
import {
  applyLensGain,
  applyPicture,
  applyStabilization,
  createRendererUniforms,
  LENS_TEXTURES,
  MAX_LENSES,
  type RendererUniforms,
} from './rendererUniforms';

export interface ThreeFrameRendererOptions {
  /**
   * Keep the drawing buffer after a frame, so tests can read it back and captures can save it;
   * costs a copy per frame, so off by default.
   */
  readonly preserveDrawingBuffer?: boolean;
}

interface RendererParts {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: Camera;
  /**
   * The fullscreen triangle; its material is the program of the picture on screen.
   */
  readonly pass: Mesh<BufferGeometry, RawShaderMaterial>;
  readonly materials: PictureMaterials;
  readonly textures: readonly VideoFrameTexture[];
  readonly uniforms: RendererUniforms;
  readonly lensCount: number;
}

/**
 * PictureRenderer over Three.js: uploads each lens frame to a texture and draws one fullscreen pass per
 * frame, laid out on the viewport as the view mode says: the stitched view of `stitch.frag.glsl`,
 * turned by the view and stabilization rotations, or the raw lens images side by side.
 */
export class ThreeFrameRenderer implements PictureRenderer<VideoFrame> {
  private framing: Framing = DEFAULT_FRAMING;
  private viewMode: ViewMode = DEFAULT_VIEW_MODE;
  /**
   * False until the first pair arrives and again after a context loss: the textures then hold
   * frames the session has closed, which must not be uploaded again.
   */
  private hasFrames = false;
  private isDisposed = false;
  private readonly meters = new Set<SeamMeter>();

  private constructor(
    private readonly parts: RendererParts,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.applyView();
    canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  public static create(
    canvas: HTMLCanvasElement,
    setup: StitchingSetup,
    options: ThreeFrameRendererOptions = {},
  ): ThreeFrameRenderer {
    ensureDrawable(setup);
    const renderer = createRenderer(canvas, options);
    const textures = Array.from({ length: setup.frameSlotCount }, () => createLensTexture());
    const uniforms = createRendererUniforms(setup, textures);
    const materials = createPictureMaterials(uniforms);
    const pass = new Mesh(createFullscreenTriangle(), materials.rectilinear);
    compilePictureMaterials(renderer, pass.geometry, materials);
    const scene = new Scene();
    scene.add(pass);
    const lensCount = setup.lenses.length;
    const camera = new Camera();
    const parts = { renderer, scene, camera, pass, materials, textures, uniforms, lensCount };
    return new ThreeFrameRenderer(parts, canvas);
  }

  public setFraming(framing: Framing): void {
    this.ensureLive();
    this.framing = framing;
    this.applyView();
    this.render();
  }

  public setViewMode(mode: ViewMode): void {
    this.ensureLive();
    this.viewMode = mode;
    this.applyView();
    this.render();
  }

  public setLensGains(gains: readonly CoreVector3[]): void {
    this.ensureLive();
    for (const [lensIndex, gain] of gains.entries()) {
      applyLensGain(this.parts.uniforms, lensIndex, gain);
    }
    this.render();
  }

  /**
   * The meter leaves this renderer's list when disposed; the renderer disposes those still live
   * when it goes, since they share its context and uniforms.
   */
  public createSeamMeter(): SeamMeter {
    this.ensureLive();
    const pass = new SeamMeterPass(this.parts.renderer, this.parts.uniforms, this.parts.lensCount);
    const meter: SeamMeter = {
      measure: () => pass.measure(),
      dispose: (): void => {
        this.meters.delete(meter);
        pass.dispose();
      },
    };
    this.meters.add(meter);
    return meter;
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
    this.render();
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
    for (const meter of this.meters) meter.dispose();
    for (const texture of this.parts.textures) texture.dispose();
    disposePictureMaterials(this.parts.materials);
    this.parts.pass.geometry.dispose();
    this.parts.renderer.dispose();
  }

  private readonly onContextLost = (): void => {
    this.hasFrames = false;
  };

  private render(): void {
    if (!this.hasFrames) return;
    this.parts.renderer.render(this.parts.scene, this.parts.camera);
  }

  /**
   * Asks the view mode what to draw for the framing on this canvas, and switches to that
   * picture's program.
   */
  private applyView(): void {
    const viewport = { width: this.canvas.width, height: this.canvas.height };
    const picture = viewModeRulesFor(this.viewMode).picture(this.framing, {
      viewport,
      lensCount: this.parts.lensCount,
    });
    this.parts.pass.material = this.parts.materials[picture.kind];
    applyPicture(this.parts.uniforms, picture, viewport.width / Math.max(viewport.height, 1));
  }

  private ensureLive(): void {
    ensureInvariant(!this.isDisposed, 'the renderer has been disposed');
  }
}

/**
 * The shader has room for `MAX_LENSES` lenses from `LENS_TEXTURES` decoded frames; a layout
 * beyond either would be drawn wrong without a word, so it is refused.
 */
function ensureDrawable(setup: StitchingSetup): void {
  if (setup.lenses.length <= MAX_LENSES && setup.frameSlotCount <= LENS_TEXTURES) return;
  throw new GyroViewError(
    'unsupported-layout',
    `the renderer draws at most ${MAX_LENSES} lenses from ${LENS_TEXTURES} frames; the layout has ${setup.lenses.length} lenses in ${setup.frameSlotCount} frames`,
  );
}

function createRenderer(
  canvas: HTMLCanvasElement,
  options: ThreeFrameRendererOptions,
): WebGLRenderer {
  // The context attributes must be given here: three keeps a context it is handed as it is.
  const context = canvas.getContext('webgl2', {
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
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
