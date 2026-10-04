import type { Framing } from './Framing';
import type { Picture } from './Picture';
import type { DragDelta, ViewportSize } from './screenLayout';
import type { TurnRequest, ZoomRequest } from './viewGestures';
import type { ViewState } from './ViewState';

/**
 * What the player shows: `raw-lenses` is each lens's decoded image on its own, unstitched, and
 * what the player opens on; `equirectangular` is the whole stitched sphere as a 2:1 panorama;
 * `normal` is a rectilinear window into the stitched sphere that the viewer turns and zooms.
 * The order is the view menu's, first to last (ADR 0022).
 */
export type ViewMode = 'raw-lenses' | 'equirectangular' | 'normal';

export const VIEW_MODES: readonly ViewMode[] = ['raw-lenses', 'equirectangular', 'normal'];
export const DEFAULT_VIEW_MODE: ViewMode = 'raw-lenses';

/**
 * What a mode needs to know about where it draws: the viewport's size, in the unit of the drags
 * on it, and how many lenses the lens tiles show. `picture` reads only the viewport's aspect, so
 * a renderer may give its size in device pixels.
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
  /**
   * The framing once zoomed by the steps, what was under the focus kept under it.
   */
  zoom(framing: Framing, zoom: ZoomRequest, context: ViewContext): Framing;
  /**
   * The framing this mode starts with, the other modes' parts left as they are.
   */
  reset(framing: Framing): Framing;
  /**
   * The framing once a page sets the view (`setView`, `lookAt`, the view attributes): taken as
   * given, unless the device holds the view (ADR 0040).
   */
  place(framing: Framing, view: ViewState): Framing;
  picture(framing: Framing, context: ViewContext): Picture;
}
