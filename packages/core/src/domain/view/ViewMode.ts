import type { Framing } from './Framing';
import { FITTED } from './magnification';
import type { Picture } from './Picture';
import {
  aspectOf,
  fittedRectangle,
  lensTiles,
  WHOLE_SCREEN,
  type ViewportSize,
} from './screenLayout';
import {
  lookAt,
  panView,
  zoomViewAt,
  type DragDelta,
  type TurnRequest,
  type ZoomRequest,
} from './viewGestures';
import { DEFAULT_VIEW, FULL_TURN, viewRotation, type ViewState } from './ViewState';
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
 * What a mode needs to know about where it draws: the viewport's size, in the unit of the drags
 * on it, and how many lenses the lens tiles show.
 */
export interface ViewContext {
  readonly viewport: ViewportSize;
  readonly lensCount: number;
}

/**
 * Strategy: how one view mode answers the viewer's gestures and what it draws. Each mode reads
 * and changes its own part of the framing, so a detour through another mode loses nothing.
 */
export interface ViewModeRules {
  /**
   * Whether the stabilization mode changes what this mode draws: the stitched pictures turn into
   * the stabilized frame, the raw lenses show the lenses as recorded.
   */
  readonly isStabilized: boolean;
  /**
   * Whether a drag moves the picture as it is framed now.
   */
  canPan(framing: Framing): boolean;
  /**
   * The framing once the picture is dragged by `delta`.
   */
  pan(framing: Framing, delta: DragDelta, context: ViewContext): Framing;
  /**
   * The framing once turned by the given angles, as the arrow keys do.
   */
  turn(framing: Framing, turn: TurnRequest, context: ViewContext): Framing;
  zoom(framing: Framing, zoom: ZoomRequest, context: ViewContext): Framing;
  /**
   * The framing this mode starts with, the other modes' parts left as they are.
   */
  reset(framing: Framing): Framing;
  picture(framing: Framing, context: ViewContext): Picture;
}

function withView(framing: Framing, view: ViewState): Framing {
  return { ...framing, view };
}

const NORMAL: ViewModeRules = {
  isStabilized: true,
  canPan: () => true,
  pan: (framing, delta, { viewport }) =>
    withView(framing, panView(framing.view, delta, viewport.width)),
  turn: (framing, turn) =>
    withView(
      framing,
      lookAt(
        framing.view,
        degrees(framing.view.yaw + turn.yaw),
        degrees(framing.view.pitch + turn.pitch),
      ),
    ),
  zoom: (framing, zoom, { viewport }) =>
    withView(framing, zoomViewAt(framing.view, zoom, aspectOf(viewport))),
  reset: (framing) => withView(framing, DEFAULT_VIEW),
  picture: ({ view }) => ({
    kind: 'rectilinear',
    rotation: viewRotation(view),
    fieldOfView: view.fieldOfView,
    area: WHOLE_SCREEN,
  }),
};

function turnedPanorama(framing: Framing, yawDelta: Degrees): Framing {
  const { view } = framing;
  return withView(framing, lookAt(view, degrees(view.yaw + yawDelta), view.pitch));
}

/**
 * Level, as an exported equirectangular video: only the yaw, which picks the direction at the
 * centre, follows the viewer, a whole turn per viewport width.
 */
const EQUIRECTANGULAR: ViewModeRules = {
  isStabilized: true,
  canPan: () => true,
  pan: (framing, delta, { viewport }) =>
    turnedPanorama(framing, degrees(-(delta.x * FULL_TURN) / Math.max(viewport.width, 1))),
  turn: (framing, turn) => turnedPanorama(framing, turn.yaw),
  zoom: (framing) => framing,
  reset: (framing) => ({
    ...withView(framing, lookAt(framing.view, degrees(0), framing.view.pitch)),
    panorama: FITTED,
  }),
  picture: ({ view }, { viewport }) => ({
    kind: 'equirectangular',
    rotation: rotationAboutY(degreesToRadians(view.yaw)),
    area: fittedRectangle(EQUIRECTANGULAR_ASPECT, aspectOf(viewport)),
  }),
};

/**
 * The decoded images as the camera recorded them: nothing turns or zooms them.
 */
const RAW_LENSES: ViewModeRules = {
  isStabilized: false,
  canPan: () => false,
  pan: (framing) => framing,
  turn: (framing) => framing,
  zoom: (framing) => framing,
  reset: (framing) => ({ ...framing, lenses: FITTED }),
  picture: (_framing, { viewport, lensCount }) => ({
    kind: 'lens-tiles',
    tiles: lensTiles(lensCount, aspectOf(viewport)),
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
