import { withPlacedView, withView, type Framing } from './Framing';
import type { Picture } from './Picture';
import { shownFieldOfView } from './rectilinear';
import { aspectOf, WHOLE_SCREEN } from './screenLayout';
import { lookAt, panView, zoomViewAt } from './viewGestures';
import type { ViewContext, ViewModeRules } from './ViewMode';
import { DEFAULT_VIEW, viewRotation } from './ViewState';
import { degrees } from '../../shared/units/angle';

/**
 * A rectilinear window into the stitched sphere over the whole viewport, turned by drags and
 * arrows and zoomed by its field of view toward the pointer.
 */
export const NORMAL_VIEW: ViewModeRules = {
  isStabilized: true,
  canPan: () => true,
  pan: (framing, delta, { viewport }) => withView(framing, panView(framing.view, delta, viewport)),
  turn: (framing, turn) => {
    const { view } = framing;
    return withView(
      framing,
      lookAt(view, degrees(view.yaw + turn.yaw), degrees(view.pitch + turn.pitch)),
    );
  },
  zoom: (framing, zoom, { viewport }) =>
    withView(framing, zoomViewAt(framing.view, zoom, aspectOf(viewport))),
  reset: (framing) => withView(framing, DEFAULT_VIEW),
  place: withPlacedView,
  picture: rectilinearPicture,
};

/**
 * The view's rectilinear picture over the whole viewport, turned by its whole rotation.
 */
export function rectilinearPicture({ view }: Framing, { viewport }: ViewContext): Picture {
  return {
    kind: 'rectilinear',
    rotation: viewRotation(view),
    fieldOfView: shownFieldOfView(view.fieldOfView, aspectOf(viewport)),
    area: WHOLE_SCREEN,
  };
}
