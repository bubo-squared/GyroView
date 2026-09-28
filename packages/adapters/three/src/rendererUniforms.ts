import {
  aspectOfArea,
  ensureIndexInRange,
  ensureInvariant,
  IDENTITY_MATRIX3,
  planeHalfExtentOf,
  type LensProjectionParameters,
  type LensStitch,
  type Matrix3 as CoreMatrix3,
  type Picture,
  type ScreenRectangle,
  type StitchingSetup,
  type Vector3 as CoreVector3,
} from '@gyroview/core';
import { Matrix3, Vector2, Vector3, Vector4, type IUniform, type Texture } from 'three';

import {
  SAMPLING_BILINEAR,
  SAMPLING_SUPERSAMPLED,
  SAMPLING_TRILINEAR,
  type SamplingStrategy,
} from './samplingStrategies';

/**
 * The shader draws at most this many lenses; the Insta360 X series has two.
 */
export const MAX_LENSES = 2;
/**
 * Decoded frames the shader samples, one sampler each (`uTexture0`, `uTexture1` in
 * `lensTextures.glsl`).
 */
export const LENS_TEXTURES = 2;

const LENS_MEI = 0;
const LENS_RADIAL_POLYNOMIAL = 1;
/**
 * The constants the GLSL sources refer to, injected as preprocessor defines so that this file is
 * their only home.
 */
export const SHADER_DEFINES: Readonly<Record<string, number>> = Object.fromEntries([
  ['MAX_LENSES', MAX_LENSES],
  ['LENS_MEI', LENS_MEI],
  ['LENS_RADIAL_POLYNOMIAL', LENS_RADIAL_POLYNOMIAL],
  ['SAMPLING_BILINEAR', SAMPLING_BILINEAR],
  ['SAMPLING_TRILINEAR', SAMPLING_TRILINEAR],
  ['SAMPLING_SUPERSAMPLED', SAMPLING_SUPERSAMPLED],
]);

/**
 * Every uniform the renderer's programs declare, named exactly as in the GLSL chunks and shared
 * by all programs as the same objects; the only place the TypeScript side spells uniform names.
 */
export interface RendererUniforms {
  readonly uLensCount: IUniform<number>;
  readonly uViewRotation: IUniform<Matrix3>;
  readonly uStabilization: IUniform<Matrix3>;
  readonly uPlaneHalfExtent: IUniform<number>;
  readonly uPictureAspect: IUniform<number>;
  readonly uScreenArea: IUniform<Vector4[]>;
  readonly uFeather: IUniform<Vector2>;
  readonly uLensRotation: IUniform<Matrix3[]>;
  readonly uLensKind: IUniform<number[]>;
  readonly uLensPrincipalPoint: IUniform<Vector2[]>;
  readonly uLensFocal: IUniform<Vector2[]>;
  readonly uLensXi: IUniform<number[]>;
  readonly uLensRadial: IUniform<Vector3[]>;
  readonly uLensTangential: IUniform<Vector2[]>;
  readonly uLensPolynomial: IUniform<Vector4[]>;
  readonly uLensHalfFov: IUniform<number[]>;
  readonly uLensWindow: IUniform<Vector4[]>;
  readonly uLensRegion: IUniform<Vector4[]>;
  readonly uLensTexture: IUniform<number[]>;
  readonly uLensGain: IUniform<Vector3[]>;
  readonly uSampling: IUniform<number>;
  readonly uTexture0: IUniform<Texture | null>;
  readonly uTexture1: IUniform<Texture | null>;
}

export function createRendererUniforms(
  setup: StitchingSetup,
  textures: readonly Texture[],
): RendererUniforms {
  const lenses = padded(setup.lenses, 'a stitching setup has one or two lenses');
  return {
    ...viewUniforms(setup),
    ...projectionUniforms(lenses),
    ...samplingUniforms(lenses),
    uTexture0: { value: textures[0] ?? null },
    uTexture1: { value: textures[1] ?? null },
  };
}

function viewUniforms(
  setup: StitchingSetup,
): Pick<
  RendererUniforms,
  | 'uLensCount'
  | 'uViewRotation'
  | 'uStabilization'
  | 'uPlaneHalfExtent'
  | 'uPictureAspect'
  | 'uScreenArea'
  | 'uFeather'
> {
  return {
    uLensCount: { value: setup.lenses.length },
    uViewRotation: { value: new Matrix3() },
    uStabilization: { value: new Matrix3() },
    uPlaneHalfExtent: { value: 1 },
    uPictureAspect: { value: 1 },
    uScreenArea: { value: Array.from({ length: MAX_LENSES }, () => new Vector4(0, 0, 1, 1)) },
    uFeather: { value: new Vector2(setup.feather.start, setup.feather.end) },
  };
}

function projectionUniforms(
  lenses: readonly LensStitch[],
): Pick<
  RendererUniforms,
  | 'uLensRotation'
  | 'uLensKind'
  | 'uLensPrincipalPoint'
  | 'uLensFocal'
  | 'uLensXi'
  | 'uLensRadial'
  | 'uLensTangential'
  | 'uLensPolynomial'
  | 'uLensHalfFov'
> {
  const slots = lenses.map((lens) => slotOf(lens.projection));
  return {
    uLensRotation: { value: lenses.map((lens) => toThreeMatrix(lens.rotation)) },
    uLensKind: { value: slots.map((slot) => slot.kind) },
    uLensPrincipalPoint: { value: lenses.map((lens) => toVector2(lens.projection.principalPoint)) },
    uLensFocal: { value: slots.map((slot) => slot.focal) },
    uLensXi: { value: slots.map((slot) => slot.xi) },
    uLensRadial: { value: slots.map((slot) => slot.radial) },
    uLensTangential: { value: slots.map((slot) => slot.tangential) },
    uLensPolynomial: { value: slots.map((slot) => slot.polynomial) },
    uLensHalfFov: { value: lenses.map((lens) => lens.halfFieldOfView) },
  };
}

/**
 * One lens model's parameters as the shader's per-lens slots; the slots a model does not use
 * stay zero.
 */
interface ProjectionSlot {
  readonly kind: number;
  readonly focal: Vector2;
  readonly xi: number;
  readonly radial: Vector3;
  readonly tangential: Vector2;
  readonly polynomial: Vector4;
}

/**
 * Exhaustive over the projection kinds: a new kind does not compile until it is packed.
 */
function slotOf(projection: LensProjectionParameters): ProjectionSlot {
  switch (projection.kind) {
    case 'mei': {
      return {
        kind: LENS_MEI,
        focal: new Vector2(...projection.focal),
        xi: projection.xi,
        radial: new Vector3(...projection.radial),
        tangential: new Vector2(...projection.tangential),
        polynomial: new Vector4(),
      };
    }
    case 'radial-polynomial': {
      return {
        kind: LENS_RADIAL_POLYNOMIAL,
        focal: new Vector2(),
        xi: 0,
        radial: new Vector3(),
        tangential: new Vector2(),
        polynomial: new Vector4(...projection.coefficients),
      };
    }
  }
}

function samplingUniforms(
  lenses: readonly LensStitch[],
): Pick<
  RendererUniforms,
  'uLensWindow' | 'uLensRegion' | 'uLensTexture' | 'uLensGain' | 'uSampling'
> {
  return {
    uLensWindow: {
      value: lenses.map(
        (lens) => new Vector4(lens.window.x, lens.window.y, lens.window.width, lens.window.height),
      ),
    },
    uLensRegion: {
      value: lenses.map(
        (lens) => new Vector4(lens.region.x, lens.region.y, lens.region.width, lens.region.height),
      ),
    },
    uLensTexture: { value: lenses.map((lens) => lens.frameSlot) },
    uLensGain: { value: lenses.map(() => new Vector3(1, 1, 1)) },
    uSampling: { value: SAMPLING_BILINEAR },
  };
}

export function applySampling(uniforms: RendererUniforms, strategy: SamplingStrategy): void {
  uniforms.uSampling.value = strategy.sampling;
}

export function applyStabilization(uniforms: RendererUniforms, rotation: CoreMatrix3): void {
  uniforms.uStabilization.value = toThreeMatrix(rotation);
}

/**
 * Sets one lens's per-channel multiplier; a lens the setup does not have is a defect.
 */
export function applyLensGain(
  uniforms: RendererUniforms,
  lensIndex: number,
  gain: CoreVector3,
): void {
  ensureIndexInRange(lensIndex, uniforms.uLensCount.value, 'lens');
  uniforms.uLensGain.value[lensIndex]?.set(...gain);
}

/**
 * Replaces one lens's body-to-lens rotation; a lens the setup does not have is a defect.
 */
/**
 * What one picture sets; a value a picture's program does not read stays neutral.
 */
interface PictureValues {
  readonly rotation: CoreMatrix3;
  readonly planeHalfExtent: number;
  readonly pictureAspect: number;
  readonly areas: readonly ScreenRectangle[];
}

const NEUTRAL = { rotation: IDENTITY_MATRIX3, planeHalfExtent: 1, pictureAspect: 1 };

/**
 * Sets the uniforms `picture` is drawn from, on a viewport `viewportAspect` wide per unit of
 * height.
 */
export function applyPicture(
  uniforms: RendererUniforms,
  picture: Picture,
  viewportAspect: number,
): void {
  const values = valuesOf(picture, viewportAspect);
  uniforms.uViewRotation.value = toThreeMatrix(values.rotation);
  uniforms.uPlaneHalfExtent.value = values.planeHalfExtent;
  uniforms.uPictureAspect.value = values.pictureAspect;
  uniforms.uScreenArea.value = padded(
    values.areas,
    'a picture fills one area per lens at most',
  ).map((area) => toVector4(area));
}

function valuesOf(picture: Picture, viewportAspect: number): PictureValues {
  switch (picture.kind) {
    case 'rectilinear': {
      return {
        rotation: picture.rotation,
        planeHalfExtent: planeHalfExtentOf(picture.fieldOfView),
        pictureAspect: aspectOfArea(picture.area, viewportAspect),
        areas: [picture.area],
      };
    }
    case 'equirectangular': {
      return { ...NEUTRAL, rotation: picture.rotation, areas: [picture.area] };
    }
    case 'lens-tiles': {
      return { ...NEUTRAL, areas: picture.tiles };
    }
  }
}

function toVector4(area: ScreenRectangle): Vector4 {
  return new Vector4(area.x, area.y, area.width, area.height);
}

/**
 * Row-major core matrix into a three matrix, whose `set` takes rows too.
 */
function toThreeMatrix(m: CoreMatrix3): Matrix3 {
  return new Matrix3().set(...m);
}

function toVector2(point: { readonly x: number; readonly y: number }): Vector2 {
  return new Vector2(point.x, point.y);
}

/**
 * Uniform arrays have a fixed length; unused slots repeat the last entry and are never read.
 */
function padded<T>(entries: readonly T[], expectation: string): readonly T[] {
  const last = entries.at(-1);
  ensureInvariant(last !== undefined && entries.length <= MAX_LENSES, expectation);
  return Array.from({ length: MAX_LENSES }, (_unused, index) => entries[index] ?? last);
}
