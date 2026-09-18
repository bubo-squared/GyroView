import {
  clampView,
  DEFAULT_VIEW,
  GyroViewError,
  type FrameSink,
  type Presentation,
  type StitchingSetup,
  type Vector3 as CoreVector3,
  type ViewState,
} from '@gyroview/core';
import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  GLSL3,
  LinearFilter,
  Mesh,
  NoColorSpace,
  RawShaderMaterial,
  Scene,
  VideoFrameTexture,
  WebGLRenderer,
} from 'three';

import fullscreenVertex from './shaders/fullscreen.vert.glsl?raw';
import lensModels from './shaders/lensModels.glsl?raw';
import precision from './shaders/precision.glsl?raw';
import rays from './shaders/rays.glsl?raw';
import stitchFragment from './shaders/stitch.frag.glsl?raw';
import { applyView, createStitchUniforms, MAX_LENSES, type StitchUniforms } from './stitchUniforms';

export interface ThreeFrameRendererOptions {
  readonly view?: ViewState;
  /**
   * Keep the drawing buffer after a frame so it can be read back or captured (tests, seam
   * inspection); costs a copy per frame, so off by default.
   */
  readonly preserveDrawingBuffer?: boolean;
}

interface RendererParts {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly material: RawShaderMaterial;
  readonly geometry: BufferGeometry;
  readonly textures: readonly VideoFrameTexture[];
  readonly uniforms: StitchUniforms;
}

/**
 * One triangle covering the clip square: two corners lie beyond it so its hypotenuse clears the
 * far edge. The fragment shader turns every pixel into a ray.
 */
const BEYOND_CLIP = 3;
const FULLSCREEN_TRIANGLE = [-1, -1, 0, BEYOND_CLIP, -1, 0, -1, BEYOND_CLIP, 0];
const POSITION_COMPONENTS = 3;
const RGBA_CHANNELS = 4;

/**
 * FrameSink over Three.js: uploads each lens frame to a texture and draws the stitched view with
 * one fullscreen pass of `stitch.frag.glsl`. Stabilization plugs in as a rotation later.
 */
export class ThreeFrameRenderer implements FrameSink<VideoFrame> {
  private viewState: ViewState;
  private hasFrames = false;

  private constructor(
    private readonly parts: RendererParts,
    private readonly canvas: HTMLCanvasElement,
    view: ViewState,
  ) {
    this.viewState = clampView(view);
    this.applyView();
  }

  public static create(
    canvas: HTMLCanvasElement,
    setup: StitchingSetup,
    options: ThreeFrameRendererOptions = {},
  ): ThreeFrameRenderer {
    if (setup.frameCount > MAX_LENSES) {
      throw new GyroViewError(
        'unsupported-layout',
        `the renderer draws at most ${MAX_LENSES} frames, the layout needs ${setup.frameCount}`,
      );
    }
    const renderer = createRenderer(canvas, options.preserveDrawingBuffer ?? false);
    const textures = Array.from({ length: setup.frameCount }, () => createLensTexture());
    const uniforms = createStitchUniforms(setup, textures);
    const material = createMaterial(uniforms);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(FULLSCREEN_TRIANGLE, POSITION_COMPONENTS),
    );
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));
    const parts = { renderer, scene, material, geometry, textures, uniforms };
    return new ThreeFrameRenderer(parts, canvas, options.view ?? DEFAULT_VIEW);
  }

  public get view(): ViewState {
    return this.viewState;
  }

  public setView(view: ViewState): void {
    this.viewState = clampView(view);
    this.applyView();
    this.render();
  }

  /**
   * Per-channel multiplier for one lens: the hook for exposure matching and for inspecting a
   * single lens (gain zero on the other).
   */
  public setLensGain(lensIndex: number, gain: CoreVector3): void {
    this.parts.uniforms.uLensGain.value[lensIndex]?.set(...gain);
    this.render();
  }

  public present(presentation: Presentation<VideoFrame>): void {
    for (const [index, texture] of this.parts.textures.entries()) {
      const frame = presentation.pair.frames[index];
      if (frame) texture.setFrame(frame.handle);
    }
    this.hasFrames = true;
    this.render();
  }

  /**
   * Matches the drawing buffer to a new element size, in device pixels.
   */
  public resize(width: number, height: number): void {
    this.parts.renderer.setSize(width, height, false);
    this.applyView();
    this.render();
  }

  /**
   * The current drawing buffer as RGBA rows from the bottom up, for tests and inspection.
   */
  public readPixels(): Uint8ClampedArray {
    const gl = this.parts.renderer.getContext();
    const pixels = new Uint8ClampedArray(this.canvas.width * this.canvas.height * RGBA_CHANNELS);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }

  public dispose(): void {
    for (const texture of this.parts.textures) texture.dispose();
    this.parts.material.dispose();
    this.parts.geometry.dispose();
    this.parts.renderer.dispose();
  }

  private render(): void {
    if (!this.hasFrames) return;
    this.parts.renderer.render(this.parts.scene, PASS_THROUGH_CAMERA);
  }

  private applyView(): void {
    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    applyView(this.parts.uniforms, this.viewState, aspect);
  }
}

/**
 * The raw shader ignores the camera; three still wants one to render a scene.
 */
const PASS_THROUGH_CAMERA = new Camera();

function createRenderer(
  canvas: HTMLCanvasElement,
  shouldPreserveDrawingBuffer: boolean,
): WebGLRenderer {
  const context = canvas.getContext('webgl2', {
    preserveDrawingBuffer: shouldPreserveDrawingBuffer,
  });
  if (!context) {
    throw new GyroViewError('render-unavailable', 'this browser has no WebGL2 context');
  }
  const renderer = new WebGLRenderer({ canvas, context, antialias: false, alpha: false });
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

function createMaterial(uniforms: StitchUniforms): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: fullscreenVertex,
    fragmentShader: [precision, rays, lensModels, stitchFragment].join('\n'),
    uniforms: { ...uniforms },
    depthTest: false,
    depthWrite: false,
  });
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
