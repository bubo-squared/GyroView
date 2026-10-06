import type { ScreenPoint, ScreenRectangle } from './screenLayout';
import { viewRotation, WIDEST_FIELD_OF_VIEW, type ViewState } from './ViewState';
import { transformVector } from '../../shared/math/Matrix3';
import { magnitudeOf, scaleVector, type Vector3 } from '../../shared/math/Vector3';
import {
  degrees,
  degreesToRadians,
  radians,
  radiansToDegrees,
  type Degrees,
} from '../../shared/units/angle';

/**
 * Half the width of the image plane at unit distance, so that a rectilinear picture spans the
 * given horizontal field of view across its width. The renderer's shader takes it as it is.
 */
export function planeHalfExtentOf(fieldOfView: Degrees): number {
  return Math.tan(degreesToRadians(degrees(fieldOfView / 2)));
}

/**
 * The field of view across a rectilinear picture of the given aspect: the view's own, narrowed
 * on a picture taller than wide so that its height spans no more than the widest field either,
 * where a rectilinear view stretches its edges more than it shows (a phone held upright would
 * span 131 degrees from top to bottom at the default 90 across).
 */
export function shownFieldOfView(fieldOfView: Degrees, pictureAspect: number): Degrees {
  // A picture as wide as tall or wider spans its widest across, where the field is bounded.
  if (pictureAspect >= 1) return fieldOfView;
  const widestHalfWidth = planeHalfExtentOf(WIDEST_FIELD_OF_VIEW) * pictureAspect;
  const widestAcross = radiansToDegrees(radians(2 * Math.atan(widestHalfWidth)));
  return degrees(Math.min(fieldOfView, widestAcross));
}

/**
 * Width over height of an area of a viewport with the given aspect.
 */
export function aspectOfArea(area: ScreenRectangle, viewportAspect: number): number {
  return (viewportAspect * area.width) / area.height;
}

/**
 * The view-space direction (x right, y down, z forward) through a point of a rectilinear picture,
 * given as fractions of the picture; `rectilinearRays.glsl` computes the same for every pixel.
 */
export function rayThroughPicture(
  fieldOfView: Degrees,
  point: ScreenPoint,
  pictureAspect: number,
): Vector3 {
  const halfExtent = planeHalfExtentOf(fieldOfView);
  const plane: Vector3 = [
    (point.x * 2 - 1) * halfExtent,
    ((point.y * 2 - 1) * halfExtent) / pictureAspect,
    1,
  ];
  return scaleVector(plane, 1 / magnitudeOf(plane));
}

/**
 * The camera body direction seen through a point of the normal view's picture, which fills the
 * viewport, so its points are the viewport's.
 */
export function directionAt(view: ViewState, point: ScreenPoint, viewportAspect: number): Vector3 {
  const fieldOfView = shownFieldOfView(view.fieldOfView, viewportAspect);
  return transformVector(viewRotation(view), rayThroughPicture(fieldOfView, point, viewportAspect));
}
