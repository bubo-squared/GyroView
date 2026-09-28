import {
  aspectOf,
  DEFAULT_FRAMING,
  DEFAULT_PICTURE_QUALITY,
  DEFAULT_VIEW_MODE,
  ensureInvariant,
  GyroViewError,
  type Framing,
  type PictureQuality,
  type Matrix3 as CoreMatrix3,
  type PictureRenderer,
  type Presentation,
  type SeamMeter,
  type StitchingSetup,
  type Vector3 as CoreVector3,
  viewModeRulesFor,
  type ViewMode,
  type ViewportSize,
} from '@gyroview/core';
import type { WebGLRenderer } from 'three';
import {
  Camera,
  Mesh,
  Scene,
  type VideoFrameTexture,
  type BufferGeometry,
  type IUniform,
  type RawShaderMaterial,
} from 'three';

import { createFullscreenTriangle } from './fullscreenPass';
import { createRenderer, type ThreeFrameRendererOptions } from './webglRenderer';

export type { ThreeFrameRendererOptions } from './webglRenderer';
import { SeamMeterPass } from './seamMeter/SeamMeterPass';
import { applySamplingStrategy, createLensTextures } from './lensTextures';
import { SAMPLING_STRATEGIES } from './samplingStrategies';
import {
  compilePictureMaterials,
  createPictureMaterials,
  disposePictureMaterials,
  PLAYER_PICTURES,
  type PictureMaterials,
  type PictureProgramSet,
} from './pictureMaterials';
import {
  applyLensGain,
  applyPicture,
  applySampling,
  applyStabilization,
  createRendererUniforms,
  LENS_TEXTURES,
  MAX_LENSES,
  type RendererUniforms,
} from './rendererUniforms';

/**
 * What a renderer draws its pictures with beyond the shared uniforms: the programs, and the
 * uniforms only they read.
 */
export interface RendererPictures {
  readonly programs: PictureProgramSet;
  readonly uniforms: Readonly<Record<string, IUniform>>;
}

const PLAYER_RENDERER_PICTURES: RendererPictures = { programs: PLAYER_PICTURES, uniforms: {} };

/**
 * How a renderer is opened: its context's options and what it draws with.
 */
interface Opening {
  readonly options: ThreeFrameRendererOptions;
  readonly pictures: RendererPictures;
}

/**
 * A meter this renderer made and disposes with itself unless disposed first.
 */
interface Meter {
  dispose(): void;
}

export interface RendererParts {
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
  /**
   * The seam meter made at creation to prove its program, kept so the program stays compiled
   * for the meter gain matching asks for at every load.
   */
  readonly seamProof: SeamMeterPass;
}

/**
 * PictureRenderer over Three.js: uploads each lens frame to a texture and draws one fullscreen pass
 * per frame, laid out on the viewport as the view mode's picture for the framing says: the
 * stitched sphere through `stitch.frag.glsl`, turned by the view and stabilization rotations, or
 * each lens image in a tile of its own.
 */
export class ThreeFrameRenderer implements PictureRenderer<VideoFrame> {
  protected readonly meters = new Set<Meter>();
  private framing: Framing = DEFAULT_FRAMING;
  private viewMode: ViewMode = DEFAULT_VIEW_MODE;
  /**
   * False until the first pair arrives. The textures then hold the pair on screen, which the
   * session keeps open until it presents the next one.
   */
  private hasFrames = false;
  private isDisposed = false;

  protected constructor(
    protected readonly parts: RendererParts,
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
    const opening = { options, pictures: PLAYER_RENDERER_PICTURES };
    return new this(this.openParts(canvas, setup, opening), canvas);
  }

  /**
   * The context, textures, uniforms and compiled programs of a renderer that draws with the
   * given pictures.
   */
  protected static openParts(
    canvas: HTMLCanvasElement,
    setup: StitchingSetup,
    opening: Opening,
  ): RendererParts {
    ensureDrawable(setup);
    const renderer = createRenderer(canvas, opening.options);
    try {
      return assembleParts(renderer, setup, opening.pictures);
    } catch (error) {
      // A shader the GPU refuses fails here; what was built goes with it.
      renderer.dispose();
      throw error;
    }
  }

  public get lensCount(): number {
    return this.parts.lensCount;
  }

  public setFraming(framing: Framing): void {
    this.ensureLive();
    this.framing = framing;
    this.applyFraming();
    this.render();
  }

  public setViewMode(mode: ViewMode): void {
    this.ensureLive();
    this.viewMode = mode;
    this.applyFraming();
    this.render();
  }

  /**
   * The frames standing on screen are uploaded again with the new filters and mip chain, so the
   * change shows at once, even while paused.
   */
  public setQuality(quality: PictureQuality): void {
    this.ensureLive();
    const strategy = SAMPLING_STRATEGIES[quality];
    for (const texture of this.parts.textures) {
      applySamplingStrategy(texture, strategy);
      if (this.hasFrames) texture.needsUpdate = true;
    }
    applySampling(this.parts.uniforms, strategy);
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
  public resize(size: ViewportSize): void {
    this.ensureLive();
    this.parts.renderer.setSize(size.width, size.height, false);
    this.applyFraming();
    this.render();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    for (const meter of this.meters) meter.dispose();
    this.parts.seamProof.dispose();
    for (const texture of this.parts.textures) texture.dispose();
    disposePictureMaterials(this.parts.materials);
    this.parts.pass.geometry.dispose();
    this.parts.renderer.dispose();
  }

  protected render(): void {
    if (!this.hasFrames) return;
    this.parts.renderer.render(this.parts.scene, this.parts.camera);
  }

  protected ensureLive(): void {
    ensureInvariant(!this.isDisposed, 'the renderer has been disposed');
  }

  /**
   * Three.js builds its state anew on a restored context but draws nothing: a paused picture
   * (iOS drops the context of a tab in the background) comes back only through a redraw, which
   * uploads the frames on screen again.
   */
  private readonly onContextRestored = (): void => {
    this.render();
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

/**
 * The textures, uniforms and programs every picture shares, read at the default quality.
 */
function sharedParts(
  setup: StitchingSetup,
  pictures: RendererPictures,
): Pick<RendererParts, 'textures' | 'uniforms' | 'materials'> {
  const strategy = SAMPLING_STRATEGIES[DEFAULT_PICTURE_QUALITY];
  const textures = createLensTextures(setup.frameSlotCount, strategy);
  const uniforms = createRendererUniforms(setup, textures);
  applySampling(uniforms, strategy);
  const materials = createPictureMaterials(
    { ...uniforms, ...pictures.uniforms },
    pictures.programs,
  );
  return { textures, uniforms, materials };
}

function assembleParts(
  renderer: WebGLRenderer,
  setup: StitchingSetup,
  pictures: RendererPictures,
): RendererParts {
  const { textures, uniforms, materials } = sharedParts(setup, pictures);
  const pass = new Mesh(createFullscreenTriangle(), materials.rectilinear);
  const seamProof = provenPrograms(renderer, { pass, materials, textures, uniforms });
  const scene = new Scene();
  scene.add(pass);
  return {
    renderer,
    scene,
    camera: new Camera(),
    pass,
    materials,
    textures,
    uniforms,
    lensCount: setup.lenses.length,
    seamProof,
  };
}

/**
 * Compiles and proves every picture program and the seam meter's (gain matching asks for one at
 * every load), and returns the proven meter; what was built goes if a program fails.
 */
function provenPrograms(
  renderer: WebGLRenderer,
  built: Pick<RendererParts, 'pass' | 'materials' | 'textures' | 'uniforms'>,
): SeamMeterPass {
  const { pass, materials, textures, uniforms } = built;
  try {
    compilePictureMaterials(renderer, pass.geometry, materials);
    return new SeamMeterPass(renderer, uniforms, uniforms.uLensCount.value);
  } catch (error) {
    disposePictureMaterials(materials);
    pass.geometry.dispose();
    for (const texture of textures) texture.dispose();
    throw error;
  }
}
