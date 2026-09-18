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

const MIN_FIELD_OF_VIEW_DEGREES = 30;
const MAX_FIELD_OF_VIEW_DEGREES = 120;
const DEFAULT_FIELD_OF_VIEW_DEGREES = 90;
const MAX_PITCH_DEGREES = 90;
const HALF_TURN_DEGREES = 180;
const FULL_TURN_DEGREES = 360;

export const MIN_FIELD_OF_VIEW = degrees(MIN_FIELD_OF_VIEW_DEGREES);
export const MAX_FIELD_OF_VIEW = degrees(MAX_FIELD_OF_VIEW_DEGREES);
export const DEFAULT_FIELD_OF_VIEW = degrees(DEFAULT_FIELD_OF_VIEW_DEGREES);

export const DEFAULT_VIEW: ViewState = {
  yaw: degrees(0),
  pitch: degrees(0),
  fieldOfView: DEFAULT_FIELD_OF_VIEW,
  projection: 'rectilinear',
};

/**
 * Keeps the view inside the sphere: yaw wrapped to (-180, 180], pitch within the poles, field
 * of view within the supported range.
 */
export function clampView(view: ViewState): ViewState {
  return {
    ...view,
    yaw: wrapHalfTurn(view.yaw),
    pitch: degrees(Math.min(Math.max(view.pitch, -MAX_PITCH_DEGREES), MAX_PITCH_DEGREES)),
    fieldOfView: degrees(
      Math.min(Math.max(view.fieldOfView, MIN_FIELD_OF_VIEW), MAX_FIELD_OF_VIEW),
    ),
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
