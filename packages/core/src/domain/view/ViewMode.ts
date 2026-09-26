import type { Framing } from './Framing';
import {
  clampMagnification,
  FITTED,
  magnifiedArea,
  magnifyAt,
  panMagnification,
  type Magnification,
} from './magnification';
import type { Picture } from './Picture';
import {
  aspectOf,
  boundsOf,
  fittedRectangle,
  lensTiles,
  SCREEN_CENTRE,
  WHOLE_SCREEN,
  type ScreenRectangle,
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
import { DEFAULT_VIEW, FULL_TURN, HALF_TURN, viewRotation, type ViewState } from './ViewState';
import { rotationAboutY } from '../../shared/math/Matrix3';
import { degrees, degreesToRadians } from '../../shared/units/angle';

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

/**
 * The panorama fitted into the viewport, before any magnification.
 */
function fittedPanorama({ viewport }: ViewContext): ScreenRectangle {
  return fittedRectangle(EQUIRECTANGULAR_ASPECT, aspectOf(viewport));
}

/**
 * The panorama's magnification with its centre kept in the middle across: sideways, the yaw
 * turns the panorama, which wraps around and so never runs out.
 */
function levelled(fitted: ScreenRectangle, magnification: Magnification): Magnification {
  const clamped = clampMagnification(fitted, magnification);
  return { ...clamped, centre: { x: SCREEN_CENTRE.x, y: clamped.centre.y } };
}

function withPanorama(framing: Framing, panorama: Magnification, yawDelta: number): Framing {
  const { view } = framing;
  return {
    ...withView(framing, lookAt(view, degrees(view.yaw + yawDelta), view.pitch)),
    panorama,
  };
}

/**
 * A drag turns the panorama a whole turn per width of the picture as shown, and moves it up and
 * down once it is taller than the viewport.
 */
function panPanorama(framing: Framing, delta: DragDelta, context: ViewContext): Framing {
  const fitted = fittedPanorama(context);
  const { viewport } = context;
  const panorama = levelled(fitted, framing.panorama);
  const shownWidth = viewport.width * fitted.width * panorama.scale;
  const moved = panMagnification(fitted, panorama, {
    x: 0,
    y: delta.y / Math.max(viewport.height, 1),
  });
  return withPanorama(
    framing,
    levelled(fitted, moved),
    -(delta.x * FULL_TURN) / Math.max(shownWidth, 1),
  );
}

/**
 * Sideways the arrows turn it; up and down they move a panorama taller than the viewport by the
 * angle they name, the picture spanning a half turn from top to bottom.
 */
function turnPanorama(framing: Framing, turn: TurnRequest, context: ViewContext): Framing {
  const fitted = fittedPanorama(context);
  const panorama = levelled(fitted, framing.panorama);
  const raised = {
    ...panorama,
    centre: { ...panorama.centre, y: panorama.centre.y - turn.pitch / HALF_TURN },
  };
  return withPanorama(framing, levelled(fitted, raised), turn.yaw);
}

/**
 * Keeps the point under the pointer where it is: up and down by the magnification's own rule,
 * sideways by turning the panorama as far as the pointer's longitude moved.
 */
function zoomPanorama(framing: Framing, zoom: ZoomRequest, context: ViewContext): Framing {
  const fitted = fittedPanorama(context);
  const before = magnifiedArea(fitted, levelled(fitted, framing.panorama));
  const zoomed = levelled(fitted, magnifyAt(fitted, levelled(fitted, framing.panorama), zoom));
  const after = magnifiedArea(fitted, zoomed);
  const across = (area: ScreenRectangle): number => (zoom.focus.x - area.x) / area.width;
  return withPanorama(framing, zoomed, (across(before) - across(after)) * FULL_TURN);
}

/**
 * Level, as an exported equirectangular video: the yaw picks the direction at the centre, and the
 * panorama magnifies up to four times and moves up and down within itself.
 */
const EQUIRECTANGULAR: ViewModeRules = {
  isStabilized: true,
  canPan: () => true,
  pan: panPanorama,
  turn: turnPanorama,
  zoom: zoomPanorama,
  reset: (framing) => ({
    ...withView(framing, lookAt(framing.view, degrees(0), framing.view.pitch)),
    panorama: FITTED,
  }),
  picture: ({ view, panorama }, context) => {
    const fitted = fittedPanorama(context);
    return {
      kind: 'equirectangular',
      rotation: rotationAboutY(degreesToRadians(view.yaw)),
      area: magnifiedArea(fitted, levelled(fitted, panorama)),
    };
  },
};

/**
 * The lens tiles fitted into the viewport, and the rectangle they fill together.
 */
function fittedTiles({ viewport, lensCount }: ViewContext): {
  readonly tiles: readonly ScreenRectangle[];
  readonly bounds: ScreenRectangle;
} {
  const tiles = lensTiles(lensCount, aspectOf(viewport));
  return { tiles, bounds: boundsOf(tiles) };
}

function withLenses(framing: Framing, lenses: Magnification): Framing {
  return { ...framing, lenses };
}

function panLenses(framing: Framing, delta: DragDelta, context: ViewContext): Framing {
  const { viewport } = context;
  const shift = {
    x: delta.x / Math.max(viewport.width, 1),
    y: delta.y / Math.max(viewport.height, 1),
  };
  return withLenses(framing, panMagnification(fittedTiles(context).bounds, framing.lenses, shift));
}

/**
 * The arrows move zoomed tiles as far as a drag of the same angle would turn the normal view at
 * its default field of view.
 */
function turnLenses(framing: Framing, turn: TurnRequest, context: ViewContext): Framing {
  const pixelsPerDegree = context.viewport.width / DEFAULT_VIEW.fieldOfView;
  const delta = { x: -(turn.yaw * pixelsPerDegree), y: turn.pitch * pixelsPerDegree };
  return panLenses(framing, delta, context);
}

/**
 * Every tile moved and enlarged by the same map that takes the fitted tiles to the magnified.
 */
function magnifiedTiles(framing: Framing, context: ViewContext): ScreenRectangle[] {
  const { tiles, bounds } = fittedTiles(context);
  const area = magnifiedArea(bounds, clampMagnification(bounds, framing.lenses));
  const scale = area.width / bounds.width;
  return tiles.map((tile) => ({
    x: area.x + (tile.x - bounds.x) * scale,
    y: area.y + (tile.y - bounds.y) * scale,
    width: tile.width * scale,
    height: tile.height * scale,
  }));
}

/**
 * The decoded images as the camera recorded them, magnified up to four times toward the
 * pointer and moved within their edges once zoomed; never turned or stitched.
 */
const RAW_LENSES: ViewModeRules = {
  isStabilized: false,
  canPan: ({ lenses }) => lenses.scale > 1,
  pan: panLenses,
  turn: turnLenses,
  zoom: (framing, zoom, context) =>
    withLenses(framing, magnifyAt(fittedTiles(context).bounds, framing.lenses, zoom)),
  reset: (framing) => withLenses(framing, FITTED),
  picture: (framing, context) => ({ kind: 'lens-tiles', tiles: magnifiedTiles(framing, context) }),
};

const RULES: Readonly<Record<ViewMode, ViewModeRules>> = {
  normal: NORMAL,
  equirectangular: EQUIRECTANGULAR,
  'raw-lenses': RAW_LENSES,
};

export function viewModeRulesFor(mode: ViewMode): ViewModeRules {
  return RULES[mode];
}
