import {
  HALF,
  pictureAt,
  SCREEN_CENTRE,
  type ScreenPoint,
  type ScreenRectangle,
  type ScreenShift,
} from './screenLayout';
import { zoomFactor, type ZoomRequest } from './viewGestures';
import { clamp } from '../../shared/math/clamp';

/**
 * How far a flat picture (the panorama, the lens tiles) is enlarged from its fitted size, and
 * which of its points is at the centre of the viewport, as fractions of the picture.
 */
export interface Magnification {
  readonly scale: number;
  readonly centre: ScreenPoint;
}

/**
 * The middle of a picture, as fractions of it.
 */
const PICTURE_MIDDLE: ScreenPoint = { x: HALF, y: HALF };

/**
 * The picture whole: every flat picture starts fitted into the viewport, its middle at the
 * viewport's centre.
 */
export const FITTED: Magnification = { scale: 1, centre: PICTURE_MIDDLE };

/**
 * Close enough to read fine detail in the panorama and in a lens: fitted to a 1920-pixel-wide
 * player, a 5.7K recording's two 2880-pixel lenses side by side are shown at a third of their
 * size, so at eight times each recorded pixel is under three pixels wide; beyond it the picture
 * only grows blurrier.
 */
export const MAX_MAGNIFICATION = 8;

/**
 * A scale this close to 1 is the fitted picture: zooming out notch by notch as far as it zoomed
 * in lands within rounding of 1, and must show the picture fitted again, not a hair enlarged.
 */
const FITTED_TOLERANCE = 1e-9;

export function isSameMagnification(a: Magnification, b: Magnification): boolean {
  return a.scale === b.scale && a.centre.x === b.centre.x && a.centre.y === b.centre.y;
}

/**
 * Where the magnified picture lies on the viewport, given where it lies fitted. The fitted
 * rectangle is centred, as every fitted picture is.
 */
export function magnifiedArea(
  fitted: ScreenRectangle,
  magnification: Magnification,
): ScreenRectangle {
  const width = fitted.width * magnification.scale;
  const height = fitted.height * magnification.scale;
  return {
    x: SCREEN_CENTRE.x - magnification.centre.x * width,
    y: SCREEN_CENTRE.y - magnification.centre.y * height,
    width,
    height,
  };
}

/**
 * The magnification brought within its limits: a scale from fitted to `MAX_MAGNIFICATION`, and a
 * centre that leaves no bar along an axis where the picture is larger than the viewport, and
 * keeps the picture centred along an axis where it is smaller.
 */
export function clampMagnification(
  fitted: ScreenRectangle,
  magnification: Magnification,
): Magnification {
  const limited = clamp(magnification.scale, 1, MAX_MAGNIFICATION);
  const scale = limited - 1 < FITTED_TOLERANCE ? 1 : limited;
  return {
    scale,
    centre: {
      x: clampedCentre(magnification.centre.x, fitted.width * scale),
      y: clampedCentre(magnification.centre.y, fitted.height * scale),
    },
  };
}

/**
 * Magnifies by the zoom's steps, keeping the point of the picture under its focus where it is,
 * as far as the limits allow.
 */
export function magnifyAt(
  fitted: ScreenRectangle,
  magnification: Magnification,
  zoom: ZoomRequest,
): Magnification {
  const current = clampMagnification(fitted, magnification);
  const underFocus = pictureAt(magnifiedArea(fitted, current), zoom.focus);
  const scale = current.scale * zoomFactor(zoom.steps);
  return clampMagnification(fitted, {
    scale,
    centre: {
      x: underFocus.x + (SCREEN_CENTRE.x - zoom.focus.x) / (fitted.width * scale),
      y: underFocus.y + (SCREEN_CENTRE.y - zoom.focus.y) / (fitted.height * scale),
    },
  });
}

/**
 * Moves the picture by a shift across the viewport, as far as its edges allow.
 */
export function panMagnification(
  fitted: ScreenRectangle,
  magnification: Magnification,
  shift: ScreenShift,
): Magnification {
  const current = clampMagnification(fitted, magnification);
  const moved = pictureShiftOf(fitted, current, shift);
  return clampMagnification(fitted, {
    scale: current.scale,
    centre: { x: current.centre.x - moved.across, y: current.centre.y - moved.down },
  });
}

/**
 * A shift across the viewport as fractions of the picture as magnified: the part of the picture
 * that passes under a fixed point.
 */
export function pictureShiftOf(
  fitted: ScreenRectangle,
  magnification: Magnification,
  shift: ScreenShift,
): ScreenShift {
  return {
    across: shift.across / (fitted.width * magnification.scale),
    down: shift.down / (fitted.height * magnification.scale),
  };
}

/**
 * Along one axis: the picture's centre point within the range that keeps the viewport covered,
 * `extent` being the picture's size in viewport lengths; the middle when it cannot cover it.
 */
function clampedCentre(centre: number, extent: number): number {
  if (extent <= 1) return HALF;
  const halfViewport = HALF / extent;
  return clamp(centre, halfViewport, 1 - halfViewport);
}
