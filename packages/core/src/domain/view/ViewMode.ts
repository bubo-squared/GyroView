import { EQUIRECTANGULAR_ASPECT } from './equirectangular';
import { fittedRectangle, lensTiles, WHOLE_SCREEN, type ScreenRectangle } from './screenLayout';
import { lookAt, panView, zoomView, type DragDelta } from './viewGestures';
import { FULL_TURN, viewRotation, type ViewState } from './ViewState';
import { IDENTITY_MATRIX3, rotationAboutY, type Matrix3 } from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, type Degrees } from '../../shared/units/angle';

/**
 * What the player shows: `normal` is a rectilinear window into the stitched sphere that the
 * viewer turns and zooms; `equirectangular` is the whole stitched sphere as a 2:1 panorama;
 * `raw-lenses` is each lens's decoded image on its own, unstitched.
 */
export type ViewMode = 'normal' | 'equirectangular' | 'raw-lenses';

export const VIEW_MODES: readonly ViewMode[] = ['normal', 'equirectangular', 'raw-lenses'];
export const DEFAULT_VIEW_MODE: ViewMode = 'normal';

/**
 * Strategy: how one view mode answers the viewer's gestures and where it draws the picture. A
 * mode leaves alone what it does not show, so the normal view survives a detour through another.
 */
export interface ViewModeRules {
  /**
   * The view once the picture is dragged by `delta` on a viewport `viewportWidth` pixels wide.
   */
  pan(view: ViewState, delta: DragDelta, viewportWidth: number): ViewState;
  /**
   * The view once turned by the given angles, as the arrow keys do.
   */
  turn(view: ViewState, yawDelta: Degrees, pitchDelta: Degrees): ViewState;
  zoom(view: ViewState, steps: number): ViewState;
  /**
   * Turns the drawn picture's directions into the stabilized frame the viewer looks around in.
   */
  rotation(view: ViewState): Matrix3;
  /**
   * Where the picture goes on a viewport `viewportAspect` wide per unit of height: one area for
   * a stitched picture, one per lens when the lenses are shown apart.
   */
  screenAreas(viewportAspect: number, lensCount: number): readonly ScreenRectangle[];
}

const NORMAL: ViewModeRules = {
  pan: panView,
  turn: (view, yawDelta, pitchDelta) =>
    lookAt(view, degrees(view.yaw + yawDelta), degrees(view.pitch + pitchDelta)),
  zoom: zoomView,
  rotation: viewRotation,
  screenAreas: () => [WHOLE_SCREEN],
};

/**
 * Level, whole and unzoomed, as an exported equirectangular video: only the yaw, which picks the
 * direction at the centre, follows the viewer.
 */
const EQUIRECTANGULAR: ViewModeRules = {
  pan: (view, delta, viewportWidth) =>
    lookAt(
      view,
      degrees(view.yaw - (delta.x * FULL_TURN) / Math.max(viewportWidth, 1)),
      view.pitch,
    ),
  turn: (view, yawDelta) => lookAt(view, degrees(view.yaw + yawDelta), view.pitch),
  zoom: (view) => view,
  rotation: (view) => rotationAboutY(degreesToRadians(view.yaw)),
  screenAreas: (viewportAspect) => [fittedRectangle(EQUIRECTANGULAR_ASPECT, viewportAspect)],
};

/**
 * The decoded images as the camera recorded them: nothing turns, zooms or rotates them, so the
 * view waits unchanged for the stitched modes.
 */
const RAW_LENSES: ViewModeRules = {
  pan: (view) => view,
  turn: (view) => view,
  zoom: (view) => view,
  rotation: () => IDENTITY_MATRIX3,
  screenAreas: (viewportAspect, lensCount) => lensTiles(lensCount, viewportAspect),
};

const RULES: Readonly<Record<ViewMode, ViewModeRules>> = {
  normal: NORMAL,
  equirectangular: EQUIRECTANGULAR,
  'raw-lenses': RAW_LENSES,
};

export function viewModeRulesFor(mode: ViewMode): ViewModeRules {
  return RULES[mode];
}
