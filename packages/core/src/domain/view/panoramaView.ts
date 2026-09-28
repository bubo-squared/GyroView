import { withView, type Framing } from './Framing';
import {
  clampMagnification,
  FITTED,
  magnifiedArea,
  magnifyAt,
  panMagnification,
  pictureShiftOf,
  type Magnification,
} from './magnification';
import {
  aspectOf,
  fittedRectangle,
  HALF,
  pictureAt,
  shiftOf,
  type DragDelta,
  type ScreenRectangle,
} from './screenLayout';
import { lookAt, type TurnRequest, type ZoomRequest } from './viewGestures';
import type { ViewContext, ViewModeRules } from './ViewMode';
import { rotationAboutY } from '../../shared/math/Matrix3';
import {
  degrees,
  degreesToRadians,
  FULL_TURN,
  HALF_TURN,
  type Degrees,
} from '../../shared/units/angle';

/**
 * An equirectangular picture spans a full turn across for a half turn from top to bottom.
 */
const EQUIRECTANGULAR_ASPECT = 2;

/**
 * The panorama fitted into the viewport, and its magnification as it may be shown there: within
 * its limits, its centre kept in the middle across, since sideways the yaw turns the panorama,
 * which wraps around and so never runs out.
 */
interface ShownPanorama {
  readonly fitted: ScreenRectangle;
  readonly panorama: Magnification;
}

function levelled(fitted: ScreenRectangle, magnification: Magnification): Magnification {
  const clamped = clampMagnification(fitted, magnification);
  return { ...clamped, centre: { x: HALF, y: clamped.centre.y } };
}

function shownPanorama(framing: Framing, { viewport }: ViewContext): ShownPanorama {
  const fitted = fittedRectangle(EQUIRECTANGULAR_ASPECT, aspectOf(viewport));
  return { fitted, panorama: levelled(fitted, framing.panorama) };
}

function withPanorama(framing: Framing, panorama: Magnification, yawDelta: Degrees): Framing {
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
  const { fitted, panorama } = shownPanorama(framing, context);
  const shift = shiftOf(delta, context.viewport);
  const moved = panMagnification(fitted, panorama, { across: 0, down: shift.down });
  const turned = pictureShiftOf(fitted, panorama, shift).across * FULL_TURN;
  return withPanorama(framing, moved, degrees(-turned));
}

/**
 * Sideways the arrows turn it; up and down they move a panorama taller than the viewport by the
 * angle they name, the picture spanning a half turn from top to bottom.
 */
function turnPanorama(framing: Framing, turn: TurnRequest, context: ViewContext): Framing {
  const { fitted, panorama } = shownPanorama(framing, context);
  const raised = {
    ...panorama,
    centre: { x: HALF, y: panorama.centre.y - turn.pitch / HALF_TURN },
  };
  return withPanorama(framing, levelled(fitted, raised), turn.yaw);
}

/**
 * Keeps the point under the pointer where it is: up and down by the magnification's own rule,
 * sideways by turning the panorama as far as the pointer's longitude moved.
 */
function zoomPanorama(framing: Framing, zoom: ZoomRequest, context: ViewContext): Framing {
  const { fitted, panorama } = shownPanorama(framing, context);
  const zoomed = levelled(fitted, magnifyAt(fitted, panorama, zoom));
  const before = pictureAt(magnifiedArea(fitted, panorama), zoom.focus);
  const after = pictureAt(magnifiedArea(fitted, zoomed), zoom.focus);
  return withPanorama(framing, zoomed, degrees((before.x - after.x) * FULL_TURN));
}

/**
 * Level, as an exported equirectangular video: the yaw picks the direction at the centre, and the
 * panorama magnifies up to four times and moves up and down within itself.
 */
export const PANORAMA_VIEW: ViewModeRules = {
  isStabilized: true,
  canPan: () => true,
  pan: panPanorama,
  turn: turnPanorama,
  zoom: zoomPanorama,
  reset: (framing) => ({
    ...withView(framing, lookAt(framing.view, degrees(0), framing.view.pitch)),
    panorama: FITTED,
  }),
  picture: (framing, context) => {
    const { fitted, panorama } = shownPanorama(framing, context);
    return {
      kind: 'equirectangular',
      rotation: rotationAboutY(degreesToRadians(framing.view.yaw)),
      area: magnifiedArea(fitted, panorama),
    };
  },
};
