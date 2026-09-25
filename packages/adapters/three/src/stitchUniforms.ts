import {
  degrees,
  degreesToRadians,
  ensureInvariant,
  viewModeRulesFor,
  type LensStitch,
  type Matrix3 as CoreMatrix3,
  type ScreenRectangle,
  type StitchingSetup,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';
import { Matrix3, Vector2, Vector3, Vector4, type IUniform, type Texture } from 'three';

/**
 * The shader draws at most this many lenses; the Insta360 X series has two.
 */
export const MAX_LENSES = 2;

/**
 * Which rays the stitch casts; the raw lenses are drawn by their own program, which ignores it.
 */
const VIEW_MODE_CODES: Readonly<Record<ViewMode, number>> = {
  normal: 0,
  equirectangular: 1,
  'raw-lenses': 2,
};
const LENS_MEI = 0;
const LENS_RADIAL_POLYNOMIAL = 1;

/**
 * The constants the GLSL sources refer to, injected as preprocessor defines so that this file is
 * their only home.
 */
export const SHADER_DEFINES: Readonly<Record<string, number>> = Object.fromEntries([
  ['MAX_LENSES', MAX_LENSES],
  ['VIEW_NORMAL', VIEW_MODE_CODES.normal],
  ['VIEW_EQUIRECTANGULAR', VIEW_MODE_CODES.equirectangular],
  ['LENS_MEI', LENS_MEI],
  ['LENS_RADIAL_POLYNOMIAL', LENS_RADIAL_POLYNOMIAL],
]);

/**
 * Every uniform of `stitch.frag.glsl`, named exactly as declared there; the only place the
 * TypeScript side spells uniform names.
 */
export interface StitchUniforms {
  readonly uLensCount: IUniform<number>;
  readonly uViewRotation: IUniform<Matrix3>;
  readonly uStabilization: IUniform<Matrix3>;
  readonly uViewMode: IUniform<number>;
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
  readonly uTexture0: IUniform<Texture | null>;
  readonly uTexture1: IUniform<Texture | null>;
}

export function createStitchUniforms(
  setup: StitchingSetup,
  textures: readonly Texture[],
): StitchUniforms {
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
  StitchUniforms,
  | 'uLensCount'
  | 'uViewRotation'
  | 'uStabilization'
  | 'uViewMode'
  | 'uPlaneHalfExtent'
  | 'uPictureAspect'
  | 'uScreenArea'
  | 'uFeather'
> {
  return {
    uLensCount: { value: setup.lenses.length },
    uViewRotation: { value: new Matrix3() },
    uStabilization: { value: new Matrix3() },
    uViewMode: { value: VIEW_MODE_CODES.normal },
    uPlaneHalfExtent: { value: 1 },
    uPictureAspect: { value: 1 },
    uScreenArea: { value: Array.from({ length: MAX_LENSES }, () => new Vector4(0, 0, 1, 1)) },
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

/**
 * What the picture is drawn from: where the viewer looks, how the mode shows it, the shape of the
 * viewport (width over height) and how many lenses there are to show.
 */
export interface ViewDrawing {
  readonly view: ViewState;
  readonly mode: ViewMode;
  readonly viewportAspect: number;
  readonly lensCount: number;
}

export function applyView(uniforms: StitchUniforms, drawing: ViewDrawing): void {
  const rules = viewModeRulesFor(drawing.mode);
  const areas = padded(
    rules.screenAreas(drawing.viewportAspect, drawing.lensCount),
    'a view mode fills one area per lens at most',
  );
  uniforms.uViewRotation.value = toThreeMatrix(rules.rotation(drawing.view));
  uniforms.uViewMode.value = VIEW_MODE_CODES[drawing.mode];
  uniforms.uPlaneHalfExtent.value = planeHalfExtentOf(drawing.view);
  uniforms.uPictureAspect.value = aspectOf(areas[0], drawing.viewportAspect);
  uniforms.uScreenArea.value = areas.map((area) => toVector4(area));
}

/**
 * Half the width of the image plane at the picture's edge, so that the horizontal field of view
 * is the one the view names.
 */
function planeHalfExtentOf(view: ViewState): number {
  return Math.tan(degreesToRadians(degrees(view.fieldOfView / 2)));
}

function aspectOf(area: ScreenRectangle | undefined, viewportAspect: number): number {
  return area ? (viewportAspect * area.width) / area.height : viewportAspect;
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
 * Uniform arrays have a fixed length; unused slots repeat the last entry and are never read.
 */
function padded<T>(entries: readonly T[], expectation: string): readonly T[] {
  const last = entries.at(-1);
  ensureInvariant(last !== undefined && entries.length <= MAX_LENSES, expectation);
  return Array.from({ length: MAX_LENSES }, (_unused, index) => entries[index] ?? last);
}
