import { withLenses, type Framing } from './Framing';
import {
  clampMagnification,
  FITTED,
  magnifiedArea,
  magnifyAt,
  panMagnification,
} from './magnification';
import {
  aspectOf,
  boundsOf,
  lensTiles,
  shiftOf,
  type DragDelta,
  type ScreenRectangle,
} from './screenLayout';
import type { TurnRequest } from './viewGestures';
import type { ViewContext, ViewModeRules } from './ViewMode';

/**
 * An arrow's angle moves zoomed tiles as a drag across the viewport would move them, a 90-degree
 * sweep crossing its width: as far as the arrow turns the normal view at its default field of
 * view, so the arrows feel alike in both.
 */
const DEGREES_ACROSS_VIEWPORT = 90;

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

function panLenses(framing: Framing, delta: DragDelta, context: ViewContext): Framing {
  const shift = shiftOf(delta, context.viewport);
  return withLenses(framing, panMagnification(fittedTiles(context).bounds, framing.lenses, shift));
}

function turnLenses(framing: Framing, turn: TurnRequest, context: ViewContext): Framing {
  const pixelsPerDegree = context.viewport.width / DEGREES_ACROSS_VIEWPORT;
  const delta = { x: -(turn.yaw * pixelsPerDegree), y: turn.pitch * pixelsPerDegree };
  return panLenses(framing, delta, context);
}

/**
 * Every tile moved and enlarged by the same map that takes the fitted tiles to the magnified.
 */
function magnifiedTiles(framing: Framing, context: ViewContext): ScreenRectangle[] {
  const { tiles, bounds } = fittedTiles(context);
  const lenses = clampMagnification(bounds, framing.lenses);
  const area = magnifiedArea(bounds, lenses);
  return tiles.map((tile) => ({
    x: area.x + (tile.x - bounds.x) * lenses.scale,
    y: area.y + (tile.y - bounds.y) * lenses.scale,
    width: tile.width * lenses.scale,
    height: tile.height * lenses.scale,
  }));
}

/**
 * The decoded images as the camera recorded them, magnified up to `MAX_MAGNIFICATION` toward the
 * pointer and moved within their edges once zoomed; never turned or stitched.
 */
export const LENS_TILES_VIEW: ViewModeRules = {
  isStabilized: false,
  canPan: ({ lenses }) => lenses.scale > 1,
  pan: panLenses,
  turn: turnLenses,
  zoom: (framing, zoom, context) =>
    withLenses(framing, magnifyAt(fittedTiles(context).bounds, framing.lenses, zoom)),
  reset: (framing) => withLenses(framing, FITTED),
  picture: (framing, context) => ({ kind: 'lens-tiles', tiles: magnifiedTiles(framing, context) }),
};
