import { DEFAULT_PICTURE_QUALITY, GyroViewError, type StitchingSetup } from '@gyroview/core';
import {
  Camera,
  Mesh,
  Scene,
  type BufferGeometry,
  type IUniform,
  type RawShaderMaterial,
  type VideoFrameTexture,
  type WebGLRenderer,
} from 'three';

import { DRAW_AT_ONCE, type DrawSchedule } from './drawSchedules';
import { createFullscreenTriangle } from './fullscreenPass';
import { createLensTextures } from './lensTextures';
import { MatrixCorrections } from './matrixCorrections';
import {
  compilePictureMaterials,
  createPictureMaterials,
  disposePictureMaterials,
  PLAYER_SHADERS,
  type PictureMaterials,
  type PictureShaders,
} from './pictureMaterials';
import {
  applyShaderSampling,
  createRendererUniforms,
  LENS_TEXTURES,
  MAX_LENSES,
  type RendererUniforms,
} from './rendererUniforms';
import { SAMPLING_STRATEGIES } from './samplingStrategies';
import { SeamMeterPass } from './seamMeter/SeamMeterPass';
import { createRenderer, type ContextOptions } from './webglRenderer';

export interface ThreeFrameRendererOptions extends ContextOptions {
  /**
   * When the picture is drawn again after a setting changes; at once unless given. A presented
   * pair and a new size are drawn at once whatever the schedule.
   */
  readonly drawSchedule?: DrawSchedule;
}

/**
 * What a renderer draws its pictures with beyond the shared uniforms: the programs, and the
 * uniforms only they read.
 */
export interface RendererPictures {
  readonly shaders: PictureShaders;
  readonly uniforms: Readonly<Record<string, IUniform>>;
}

export const PLAYER_PICTURES: RendererPictures = { shaders: PLAYER_SHADERS, uniforms: {} };

/**
 * How a renderer is opened: its context's options and what it draws with.
 */
export interface Opening {
  readonly options: ThreeFrameRendererOptions;
  readonly pictures: RendererPictures;
}

/**
 * A part of a renderer that holds GPU or browser resources until disposed.
 */
interface Part {
  dispose(): void;
}

/**
 * The parts a renderer was built of, disposed of together, the last built first: on the renderer's
 * disposal, and at once when a later part fails to build (a shader the GPU refuses), so a failed
 * opening leaves nothing behind.
 */
export class BuiltParts {
  private readonly parts: Part[] = [];

  public static disposedOnFailure<T>(build: (built: BuiltParts) => T): T {
    const built = new BuiltParts();
    try {
      return build(built);
    } catch (error) {
      built.dispose();
      throw error;
    }
  }

  public keep<P extends Part>(part: P): P {
    this.parts.push(part);
    return part;
  }

  public dispose(): void {
    for (let part = this.parts.pop(); part; part = this.parts.pop()) part.dispose();
  }
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
  readonly matrixCorrections: MatrixCorrections;
  readonly lensCount: number;
  readonly drawSchedule: DrawSchedule;
  /**
   * The seam meter made at creation to prove its program, kept so the program stays compiled
   * for the meter gain matching asks for at every load.
   */
  readonly seamProof: SeamMeterPass;
  readonly built: BuiltParts;
}

/**
 * The context, textures, uniforms and compiled programs of a renderer that draws with the given
 * pictures. Every program is compiled and proven here, so a broken shader fails at creation
 * rather than at the first frame, and a change of view mode is instant.
 */
export function openRendererParts(
  canvas: HTMLCanvasElement,
  setup: StitchingSetup,
  opening: Opening,
): RendererParts {
  ensureDrawable(setup);
  return BuiltParts.disposedOnFailure((built) => {
    const renderer = built.keep(createRenderer(canvas, opening.options));
    const shared = sharedParts(setup, opening.pictures, built);
    const pass = new Mesh(built.keep(createFullscreenTriangle()), shared.materials.rectilinear);
    compilePictureMaterials(renderer, pass.geometry, shared.materials);
    const seamProof = built.keep(new SeamMeterPass(renderer, shared.uniforms, setup.lenses.length));
    return {
      ...shared,
      renderer,
      scene: new Scene().add(pass),
      camera: new Camera(),
      pass,
      matrixCorrections: new MatrixCorrections(setup.lenses, shared.uniforms.uLensMatrixCorrection),
      lensCount: setup.lenses.length,
      drawSchedule: opening.options.drawSchedule ?? DRAW_AT_ONCE,
      seamProof,
      built,
    };
  });
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
  built: BuiltParts,
): Pick<RendererParts, 'textures' | 'uniforms' | 'materials'> {
  const strategy = SAMPLING_STRATEGIES[DEFAULT_PICTURE_QUALITY];
  const textures = createLensTextures(setup.frameSlotCount, strategy).map((texture) =>
    built.keep(texture),
  );
  const uniforms = createRendererUniforms(setup, textures);
  applyShaderSampling(uniforms, strategy);
  const materials = createPictureMaterials({ ...uniforms, ...pictures.uniforms }, pictures.shaders);
  built.keep({
    dispose: () => {
      disposePictureMaterials(materials);
    },
  });
  return { textures, uniforms, materials };
}
