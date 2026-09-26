import type { Picture } from './Picture';
import { fittedRectangle, lensTiles, WHOLE_SCREEN } from './screenLayout';
import { lookAt, panView, zoomView, type DragDelta } from './viewGestures';
import { FULL_TURN, viewRotation, type ViewState } from './ViewState';
import { rotationAboutY } from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, type Degrees } from '../../shared/units/angle';

/**
 * An equirectangular picture spans a full turn across for a half turn from top to bottom.
 */
const EQUIRECTANGULAR_ASPECT = 2;

/**
 * What the player shows: `normal` is a rectilinear window into the stitched sphere that the
 * viewer turns and zooms; `equirectangular` is the whole stitched sphere as a 2:1 panorama;
 * `raw-lenses` is each lens's decoded image on its own, unstitched.
 */
export type ViewMode = 'normal' | 'equirectangular' | 'raw-lenses';

export const VIEW_MODES: readonly ViewMode[] = ['normal', 'equirectangular', 'raw-lenses'];
export const DEFAULT_VIEW_MODE: ViewMode = 'normal';

/**
 * Strategy: how one view mode answers the viewer's gestures and what it draws. A mode leaves
 * alone what it does not show, so the normal view survives a detour through another.
 */
export interface ViewModeRules {
  /**
   * Whether the stabilization mode changes what this mode draws: the stitched pictures turn into
   * the stabilized frame, the raw lenses show the lenses as recorded.
   */
  readonly isStabilized: boolean;
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
   * The picture for this view on a viewport `viewportAspect` wide per unit of height.
   */
  picture(view: ViewState, viewportAspect: number, lensCount: number): Picture;
}

const NORMAL: ViewModeRules = {
  isStabilized: true,
  pan: panView,
  turn: (view, yawDelta, pitchDelta) =>
    lookAt(view, degrees(view.yaw + yawDelta), degrees(view.pitch + pitchDelta)),
  zoom: zoomView,
  picture: (view) => ({
    kind: 'rectilinear',
    rotation: viewRotation(view),
    fieldOfView: view.fieldOfView,
    area: WHOLE_SCREEN,
  }),
};

/**
 * Level, whole and unzoomed, as an exported equirectangular video: only the yaw, which picks the
 * direction at the centre, follows the viewer.
 */
const EQUIRECTANGULAR: ViewModeRules = {
  isStabilized: true,
  pan: (view, delta, viewportWidth) =>
    lookAt(
      view,
      degrees(view.yaw - (delta.x * FULL_TURN) / Math.max(viewportWidth, 1)),
      view.pitch,
    ),
  turn: (view, yawDelta) => lookAt(view, degrees(view.yaw + yawDelta), view.pitch),
  zoom: (view) => view,
  picture: (view, viewportAspect) => ({
    kind: 'equirectangular',
    rotation: rotationAboutY(degreesToRadians(view.yaw)),
    area: fittedRectangle(EQUIRECTANGULAR_ASPECT, viewportAspect),
  }),
};

/**
 * The decoded images as the camera recorded them: nothing turns or zooms them, so the view waits
 * unchanged for the stitched modes.
 */
const RAW_LENSES: ViewModeRules = {
  isStabilized: false,
  pan: (view) => view,
  turn: (view) => view,
  zoom: (view) => view,
  picture: (_view, viewportAspect, lensCount) => ({
    kind: 'lens-tiles',
    tiles: lensTiles(lensCount, viewportAspect),
  }),
};

const RULES: Readonly<Record<ViewMode, ViewModeRules>> = {
  normal: NORMAL,
  equirectangular: EQUIRECTANGULAR,
  'raw-lenses': RAW_LENSES,
};

export function viewModeRulesFor(mode: ViewMode): ViewModeRules {
  return RULES[mode];
}
