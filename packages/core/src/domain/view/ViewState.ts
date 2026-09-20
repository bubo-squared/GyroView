import { ensureInvariant } from '../../shared/errors/GyroViewError';
import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  type Matrix3,
} from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, type Degrees } from '../../shared/units/angle';

export type Projection = 'rectilinear' | 'stereographic' | 'equirectangular';

/**
 * Where the viewer looks and how the sphere is flattened. Angles are in the camera body frame:
 * yaw positive looks right, pitch positive looks up; the field of view is horizontal.
 */
export interface ViewState {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly fieldOfView: Degrees;
  readonly projection: Projection;
}

export interface FieldOfViewBounds {
  readonly min: Degrees;
  readonly max: Degrees;
}

const NARROWEST_DEGREES = 30;
const RECTILINEAR_WIDEST_DEGREES = 120;
/**
 * A little planet needs more than a half turn to show the ground curling round the horizon.
 */
const STEREOGRAPHIC_WIDEST_DEGREES = 300;
const DEFAULT_FIELD_OF_VIEW_DEGREES = 90;
const MAX_PITCH_DEGREES = 90;
const HALF_TURN_DEGREES = 180;
const FULL_TURN_DEGREES = 360;

/**
 * Each projection tolerates its own range; the equirectangular one always shows the whole
 * sphere and keeps the field of view only so switching back is seamless.
 */
const FIELD_OF_VIEW_BOUNDS: Readonly<Record<Projection, FieldOfViewBounds>> = {
  rectilinear: { min: degrees(NARROWEST_DEGREES), max: degrees(RECTILINEAR_WIDEST_DEGREES) },
  stereographic: { min: degrees(NARROWEST_DEGREES), max: degrees(STEREOGRAPHIC_WIDEST_DEGREES) },
  equirectangular: { min: degrees(NARROWEST_DEGREES), max: degrees(RECTILINEAR_WIDEST_DEGREES) },
};

const DEFAULT_FIELD_OF_VIEW = degrees(DEFAULT_FIELD_OF_VIEW_DEGREES);
export const FULL_TURN = degrees(FULL_TURN_DEGREES);

export const DEFAULT_VIEW: ViewState = {
  yaw: degrees(0),
  pitch: degrees(0),
  fieldOfView: DEFAULT_FIELD_OF_VIEW,
  projection: 'rectilinear',
};

export function fieldOfViewBoundsFor(projection: Projection): FieldOfViewBounds {
  return FIELD_OF_VIEW_BOUNDS[projection];
}

/**
 * Keeps the view inside the sphere: yaw wrapped to (-180, 180], pitch within the poles, field
 * of view within the projection's range. Non-finite angles are a programming error.
 */
export function clampView(view: ViewState): ViewState {
  ensureInvariant(
    [view.yaw, view.pitch, view.fieldOfView].every((angle) => Number.isFinite(angle)),
    'view angles must be finite',
  );
  const bounds = fieldOfViewBoundsFor(view.projection);
  return {
    ...view,
    yaw: wrapHalfTurn(view.yaw),
    pitch: degrees(Math.min(Math.max(view.pitch, -MAX_PITCH_DEGREES), MAX_PITCH_DEGREES)),
    fieldOfView: degrees(Math.min(Math.max(view.fieldOfView, bounds.min), bounds.max)),
  };
}

/**
 * Turns view-space directions (z forward) into camera body directions: pitch about the body's
 * lateral axis first, then yaw about its vertical axis. Body y points down, so a positive
 * rotation about x tilts the forward direction upwards.
 */
export function viewRotation(view: ViewState): Matrix3 {
  return multiplyMatrices(
    rotationAboutY(degreesToRadians(view.yaw)),
    rotationAboutX(degreesToRadians(view.pitch)),
  );
}

function wrapHalfTurn(angle: Degrees): Degrees {
  let wrapped: number = angle % FULL_TURN_DEGREES;
  if (wrapped > HALF_TURN_DEGREES) wrapped -= FULL_TURN_DEGREES;
  if (wrapped <= -HALF_TURN_DEGREES) wrapped += FULL_TURN_DEGREES;
  return degrees(wrapped);
}
