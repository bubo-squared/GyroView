import { SCREEN_CENTRE, type ScreenPoint } from './screenLayout';
import { clampView, viewRotation, type ViewState } from './ViewState';
import { rotationAboutX, transformVector } from '../../shared/math/Matrix3';
import { magnitudeOf, scaleVector, type Vector3 } from '../../shared/math/Vector3';
import {
  degrees,
  degreesToRadians,
  radians,
  radiansToDegrees,
  wrapHalfTurn,
  type Degrees,
} from '../../shared/units/angle';

/**
 * A pointer movement on the viewport, in CSS pixels; positive x to the right, positive y down.
 */
export interface DragDelta {
  readonly x: number;
  readonly y: number;
}

/**
 * A turn by angles, as the arrow keys make: positive yaw to the right, positive pitch up.
 */
export interface TurnRequest {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
}

/**
 * A zoom by `steps` wheel notches or pinch steps (positive zooms in), keeping the point under
 * `focus`, a point of the viewport, where it is.
 */
export interface ZoomRequest {
  readonly steps: number;
  readonly focus: ScreenPoint;
}

/**
 * How much each wheel notch or pinch step magnifies, in every view mode.
 */
const ZOOM_STEP = 1.1;

/**
 * The magnification `steps` zoom steps make: above 1 zooms in, below 1 out.
 */
export function zoomFactor(steps: number): number {
  return ZOOM_STEP ** steps;
}

/**
 * Angle covered by one pixel across the viewport: the field of view spread over its width.
 */
function degreesPerPixel(view: ViewState, viewportWidth: number): Degrees {
  return degrees(view.fieldOfView / Math.max(viewportWidth, 1));
}

/**
 * Turns the view by a drag: dragging the picture to the right turns the viewer to the left, as
 * grabbing a globe does, by as many degrees as the drag covers at the current field of view.
 */
export function panView(view: ViewState, delta: DragDelta, viewportWidth: number): ViewState {
  const perPixel = degreesPerPixel(view, viewportWidth);
  return clampView({
    ...view,
    yaw: degrees(view.yaw - delta.x * perPixel),
    pitch: degrees(view.pitch + delta.y * perPixel),
  });
}

/**
 * Narrows the field of view by `steps` zoom steps (negative widens), within its bounds.
 */
export function zoomView(view: ViewState, steps: number): ViewState {
  return clampView({ ...view, fieldOfView: degrees(view.fieldOfView / zoomFactor(steps)) });
}

/**
 * Zooms the normal view toward a point of the viewport: the field of view narrows or widens as
 * `zoomView` does, and the view turns so that the direction under the point stays under it. When
 * the poles leave no such turn, it zooms about the centre.
 */
export function zoomViewAt(view: ViewState, zoom: ZoomRequest, viewportAspect: number): ViewState {
  const zoomed = zoomView(view, zoom.steps);
  // The centre needs no turn; leaving the trigonometry out keeps the angles exactly as they were.
  const isAtCentre = zoom.focus.x === SCREEN_CENTRE.x && zoom.focus.y === SCREEN_CENTRE.y;
  if (isAtCentre || zoomed.fieldOfView === view.fieldOfView) return zoomed;
  const direction = directionAt(view, zoom.focus, viewportAspect);
  const ray = rayThrough(zoomed.fieldOfView, zoom.focus, viewportAspect);
  const pitch = pitchRaising(ray, direction[1], view.pitch);
  if (pitch === undefined) return zoomed;
  const tilted = transformVector(rotationAboutX(degreesToRadians(pitch)), ray);
  const yaw = radiansToDegrees(
    radians(Math.atan2(direction[0], direction[2]) - Math.atan2(tilted[0], tilted[2])),
  );
  return clampView({ ...zoomed, yaw, pitch });
}

/**
 * The camera body direction seen through a point of the viewport in the normal view, as the
 * renderer draws it: a rectilinear picture spanning the field of view across the viewport.
 */
export function directionAt(view: ViewState, point: ScreenPoint, viewportAspect: number): Vector3 {
  return transformVector(viewRotation(view), rayThrough(view.fieldOfView, point, viewportAspect));
}

/**
 * The view-space direction (x right, y down, z forward) through a point of a rectilinear picture
 * with this horizontal field of view; the renderer's `rectilinearRays.glsl` in TypeScript.
 */
function rayThrough(fieldOfView: Degrees, point: ScreenPoint, viewportAspect: number): Vector3 {
  const halfExtent = Math.tan(degreesToRadians(degrees(fieldOfView / 2)));
  const plane: Vector3 = [
    (point.x * 2 - 1) * halfExtent,
    ((point.y * 2 - 1) * halfExtent) / viewportAspect,
    1,
  ];
  return scaleVector(plane, 1 / magnitudeOf(plane));
}

/**
 * The pitch that brings `ray` to the height `height` of the target direction, which the yaw
 * applied after it leaves alone: `y cos θ - z sin θ` is `reach cos(θ + phase)`. Of the two
 * solutions the one nearer `current`; none when no pitch reaches that height.
 */
function pitchRaising(ray: Vector3, height: number, current: Degrees): Degrees | undefined {
  const [, y, z] = ray;
  const cosine = height / Math.hypot(y, z);
  if (Math.abs(cosine) > 1) return undefined;
  const phase = radiansToDegrees(radians(Math.atan2(z, y)));
  const spread = radiansToDegrees(radians(Math.acos(cosine)));
  const rising = wrapHalfTurn(degrees(spread - phase));
  const falling = wrapHalfTurn(degrees(0 - spread - phase));
  return Math.abs(rising - current) <= Math.abs(falling - current) ? rising : falling;
}

/**
 * How many zoom steps a pinch from `previousDistance` to `distance` is worth, in the same steps
 * as a wheel notch: positive when the fingers spread (zoom in), zero when either distance is
 * degenerate.
 */
export function zoomStepsForPinch(previousDistance: number, distance: number): number {
  return previousDistance <= 0 || distance <= 0
    ? 0
    : Math.log(distance / previousDistance) / Math.log(ZOOM_STEP);
}

/**
 * Points the view at a direction, clamped like every other change.
 */
export function lookAt(view: ViewState, yaw: Degrees, pitch: Degrees): ViewState {
  return clampView({ ...view, yaw, pitch });
}
