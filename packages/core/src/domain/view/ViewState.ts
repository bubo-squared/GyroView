import { ensureInvariant } from '../../shared/errors/GyroViewError';
import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  type Matrix3,
} from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, wrapHalfTurn, type Degrees } from '../../shared/units/angle';
import { clamp } from '../../shared/math/clamp';

/**
 * Where the viewer looks. Angles are in the camera body frame: yaw positive looks right, pitch
 * positive looks up, roll positive turns the view clockwise about its line of sight (only while
 * the device holds the view, ADR 0040); the field of view is horizontal.
 */
export interface ViewState {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly roll: Degrees;
  readonly fieldOfView: Degrees;
}

/**
 * From a short telephoto to a wide angle: past 120 degrees a rectilinear view stretches its
 * edges more than it shows.
 */
const NARROWEST_DEGREES = 30;
const WIDEST_DEGREES = 120;
export const WIDEST_FIELD_OF_VIEW = degrees(WIDEST_DEGREES);
const DEFAULT_FIELD_OF_VIEW_DEGREES = 90;
const MAX_PITCH_DEGREES = 90;

export const DEFAULT_VIEW: ViewState = {
  yaw: degrees(0),
  pitch: degrees(0),
  roll: degrees(0),
  fieldOfView: degrees(DEFAULT_FIELD_OF_VIEW_DEGREES),
};

/**
 * Keeps the view inside the sphere: yaw and roll wrapped to (-180, 180], pitch within the poles,
 * field of view within its bounds. Non-finite angles are a programming error.
 */
export function clampView(view: ViewState): ViewState {
  ensureInvariant(
    [view.yaw, view.pitch, view.roll, view.fieldOfView].every((angle) => Number.isFinite(angle)),
    'view angles must be finite',
  );
  return {
    ...view,
    yaw: wrapHalfTurn(view.yaw),
    roll: wrapHalfTurn(view.roll),
    pitch: degrees(clamp(view.pitch, -MAX_PITCH_DEGREES, MAX_PITCH_DEGREES)),
    fieldOfView: degrees(clamp(view.fieldOfView, NARROWEST_DEGREES, WIDEST_DEGREES)),
  };
}

export function isSameView(a: ViewState, b: ViewState): boolean {
  return (
    a.yaw === b.yaw && a.pitch === b.pitch && a.roll === b.roll && a.fieldOfView === b.fieldOfView
  );
}

/**
 * Turns view-space directions (x right, y down, z forward) into camera body directions: roll
 * about the line of sight first, then pitch about the body's lateral axis, then yaw about its
 * vertical axis. Body y points down, so a positive rotation about x tilts the forward direction
 * upwards, and one about z turns the screen's right toward its bottom: clockwise.
 */
export function viewRotation(view: ViewState): Matrix3 {
  const pointed = multiplyMatrices(
    rotationAboutY(degreesToRadians(view.yaw)),
    rotationAboutX(degreesToRadians(view.pitch)),
  );
  return multiplyMatrices(pointed, rotationAboutZ(degreesToRadians(view.roll)));
}
