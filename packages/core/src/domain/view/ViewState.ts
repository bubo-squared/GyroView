import { ensureInvariant } from '../../shared/errors/GyroViewError';
import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  type Matrix3,
} from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, wrapHalfTurn, type Degrees } from '../../shared/units/angle';

/**
 * Where the viewer looks. Angles are in the camera body frame: yaw positive looks right, pitch
 * positive looks up; the field of view is horizontal.
 */
export interface ViewState {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly fieldOfView: Degrees;
}

/**
 * From a short telephoto to a wide angle: past 120 degrees a rectilinear view stretches its
 * edges more than it shows.
 */
const NARROWEST_DEGREES = 30;
const WIDEST_DEGREES = 120;
const DEFAULT_FIELD_OF_VIEW_DEGREES = 90;
const MAX_PITCH_DEGREES = 90;

export const DEFAULT_VIEW: ViewState = {
  yaw: degrees(0),
  pitch: degrees(0),
  fieldOfView: degrees(DEFAULT_FIELD_OF_VIEW_DEGREES),
};

/**
 * Keeps the view inside the sphere: yaw wrapped to (-180, 180], pitch within the poles, field
 * of view within its bounds. Non-finite angles are a programming error.
 */
export function clampView(view: ViewState): ViewState {
  ensureInvariant(
    [view.yaw, view.pitch, view.fieldOfView].every((angle) => Number.isFinite(angle)),
    'view angles must be finite',
  );
  return {
    ...view,
    yaw: wrapHalfTurn(view.yaw),
    pitch: degrees(Math.min(Math.max(view.pitch, -MAX_PITCH_DEGREES), MAX_PITCH_DEGREES)),
    fieldOfView: degrees(Math.min(Math.max(view.fieldOfView, NARROWEST_DEGREES), WIDEST_DEGREES)),
  };
}

export function isSameView(a: ViewState, b: ViewState): boolean {
  return a.yaw === b.yaw && a.pitch === b.pitch && a.fieldOfView === b.fieldOfView;
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
