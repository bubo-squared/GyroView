import type { ScreenPoint } from './screenLayout';
import { clampView, type ViewState } from './ViewState';
import { degrees, type Degrees } from '../../shared/units/angle';

/**
 * A pointer movement on the viewport, in CSS pixels; positive x to the right, positive y down.
 */
export interface DragDelta {
  readonly x: number;
  readonly y: number;
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
