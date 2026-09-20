import {
  degrees,
  degreesToRadians,
  ensureInvariant,
  viewRotation,
  type LensStitch,
  type Matrix3 as CoreMatrix3,
  type Projection,
  type StitchingSetup,
  type ViewState,
} from '@gyroview/core';
import { Matrix3, Vector2, Vector3, Vector4, type IUniform, type Texture } from 'three';

/**
 * The shader draws at most this many lenses; the Insta360 X series has two.
 */
export const MAX_LENSES = 2;

const PROJECTION_CODES: Readonly<Record<Projection, number>> = {
  rectilinear: 0,
  stereographic: 1,
  equirectangular: 2,
};
const LENS_MEI = 0;
const LENS_RADIAL_POLYNOMIAL = 1;

/**
 * The constants the GLSL sources refer to, injected as preprocessor defines so that this file is
 * their only home.
 */
export const SHADER_DEFINES: Readonly<Record<string, number>> = Object.fromEntries([
  ['MAX_LENSES', MAX_LENSES],
  ['PROJECTION_RECTILINEAR', PROJECTION_CODES.rectilinear],
  ['PROJECTION_STEREOGRAPHIC', PROJECTION_CODES.stereographic],
  ['PROJECTION_EQUIRECTANGULAR', PROJECTION_CODES.equirectangular],
  ['LENS_MEI', LENS_MEI],
  ['LENS_RADIAL_POLYNOMIAL', LENS_RADIAL_POLYNOMIAL],
]);

const QUARTER = 4;

/**
 * Every uniform of `stitch.frag.glsl`, named exactly as declared there; the only place the
 * TypeScript side spells uniform names.
 */
export interface StitchUniforms {
  readonly uLensCount: IUniform<number>;
  readonly uViewRotation: IUniform<Matrix3>;
  readonly uStabilization: IUniform<Matrix3>;
  readonly uProjection: IUniform<number>;
  readonly uPlaneHalfExtent: IUniform<number>;
  readonly uAspect: IUniform<number>;
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
  readonly uTexture0: IUniform<Texture | null>;
  readonly uTexture1: IUniform<Texture | null>;
}

export function createStitchUniforms(
  setup: StitchingSetup,
  textures: readonly Texture[],
): StitchUniforms {
  const lenses = padded(setup.lenses);
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
  StitchUniforms,
  | 'uLensCount'
  | 'uViewRotation'
  | 'uStabilization'
  | 'uProjection'
  | 'uPlaneHalfExtent'
  | 'uAspect'
  | 'uFeather'
> {
  return {
    uLensCount: { value: setup.lenses.length },
    uViewRotation: { value: new Matrix3() },
    uStabilization: { value: new Matrix3() },
    uProjection: { value: PROJECTION_CODES.rectilinear },
    uPlaneHalfExtent: { value: 1 },
    uAspect: { value: 1 },
    uFeather: { value: new Vector2(setup.feather.start, setup.feather.end) },
  };
}

function projectionUniforms(
  lenses: readonly LensStitch[],
): Pick<
  StitchUniforms,
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
  return {
    uLensRotation: { value: lenses.map((lens) => toThreeMatrix(lens.rotation)) },
    uLensKind: { value: lenses.map((lens) => kindOf(lens)) },
    uLensPrincipalPoint: { value: lenses.map((lens) => toVector2(lens.projection.principalPoint)) },
    uLensFocal: { value: lenses.map((lens) => focalOf(lens)) },
    uLensXi: {
      value: lenses.map((lens) => (lens.projection.kind === 'mei' ? lens.projection.xi : 0)),
    },
    uLensRadial: { value: lenses.map((lens) => radialOf(lens)) },
    uLensTangential: { value: lenses.map((lens) => tangentialOf(lens)) },
    uLensPolynomial: { value: lenses.map((lens) => polynomialOf(lens)) },
    uLensHalfFov: { value: lenses.map((lens) => lens.halfFieldOfView) },
  };
}

function samplingUniforms(
  lenses: readonly LensStitch[],
): Pick<StitchUniforms, 'uLensWindow' | 'uLensRegion' | 'uLensTexture' | 'uLensGain'> {
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
    uLensTexture: { value: lenses.map((lens) => lens.frameIndex) },
    uLensGain: { value: lenses.map(() => new Vector3(1, 1, 1)) },
  };
}

export function applyStabilization(uniforms: StitchUniforms, rotation: CoreMatrix3): void {
  uniforms.uStabilization.value = toThreeMatrix(rotation);
}

export function applyView(uniforms: StitchUniforms, view: ViewState, aspect: number): void {
  uniforms.uViewRotation.value = toThreeMatrix(viewRotation(view));
  uniforms.uProjection.value = PROJECTION_CODES[view.projection];
  uniforms.uPlaneHalfExtent.value = planeHalfExtentOf(view);
  uniforms.uAspect.value = aspect;
}

/**
 * Half the width of the image plane at the screen edge, so that the horizontal field of view is
 * the one the view names: `tan(fov / 2)` for a rectilinear view, `2 tan(fov / 4)` for the
 * stereographic one whose image radius is `2 tan(theta / 2)`.
 */
function planeHalfExtentOf(view: ViewState): number {
  const halfFieldOfView = degreesToRadians(degrees(view.fieldOfView / 2));
  return view.projection === 'stereographic'
    ? 2 * Math.tan(degreesToRadians(degrees(view.fieldOfView / QUARTER)))
    : Math.tan(halfFieldOfView);
}

/**
 * Row-major core matrix into a three matrix, whose `set` takes rows too.
 */
function toThreeMatrix(m: CoreMatrix3): Matrix3 {
  return new Matrix3().set(...m);
}

function kindOf(lens: LensStitch): number {
  return lens.projection.kind === 'mei' ? LENS_MEI : LENS_RADIAL_POLYNOMIAL;
}

function toVector2(point: { readonly x: number; readonly y: number }): Vector2 {
  return new Vector2(point.x, point.y);
}

function focalOf(lens: LensStitch): Vector2 {
  return lens.projection.kind === 'mei'
    ? new Vector2(lens.projection.focal[0], lens.projection.focal[1])
    : new Vector2(0, 0);
}

function radialOf(lens: LensStitch): Vector3 {
  return lens.projection.kind === 'mei' ? new Vector3(...lens.projection.radial) : new Vector3();
}

function tangentialOf(lens: LensStitch): Vector2 {
  return lens.projection.kind === 'mei'
    ? new Vector2(...lens.projection.tangential)
    : new Vector2();
}

function polynomialOf(lens: LensStitch): Vector4 {
  return lens.projection.kind === 'radial-polynomial'
    ? new Vector4(...lens.projection.coefficients)
    : new Vector4();
}

/**
 * Uniform arrays have a fixed length; unused slots repeat the last lens and are never read.
 */
function padded(lenses: readonly LensStitch[]): readonly LensStitch[] {
  const last = lenses.at(-1);
  ensureInvariant(
    last !== undefined && lenses.length <= MAX_LENSES,
    'a stitching setup has one or two lenses',
  );
  return Array.from({ length: MAX_LENSES }, (_unused, index) => lenses[index] ?? last);
}
