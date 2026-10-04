import { DEFAULT_FRAMING, type Framing } from '../../src/domain/view/Framing';
import type { TurnRequest } from '../../src/domain/view/viewGestures';
import type { ViewContext } from '../../src/domain/view/ViewMode';
import type { ViewState } from '../../src/domain/view/ViewState';
import { degrees } from '../../src/shared/units/angle';

/**
 * A square viewport, 900 CSS pixels a side, with the two lenses of every accepted layout: the
 * panorama and the lens tiles fill its width with bars above and below.
 */
export const SQUARE: ViewContext = { viewport: { width: 900, height: 900 }, lensCount: 2 };

/**
 * A 16:9 viewport, where the fitted panorama leaves thinner bars above and below.
 */
export const WIDE: ViewContext = { viewport: { width: 1600, height: 900 }, lensCount: 2 };

export const TILTED: ViewState = {
  yaw: degrees(90),
  pitch: degrees(30),
  roll: degrees(0),
  fieldOfView: degrees(60),
};

export const ZOOMED_IN = { scale: 2, centre: { x: 0.4, y: 0.6 } };

/**
 * Every part moved from where it starts, so a rule that touches a part it should leave shows.
 */
export const EVERYTHING_MOVED: Framing = {
  view: TILTED,
  panorama: { scale: 3, centre: { x: 0.5, y: 0.55 } },
  lenses: ZOOMED_IN,
};

export function framed(view: ViewState): Framing {
  return { ...DEFAULT_FRAMING, view };
}

export function turnOf(yaw: number, pitch: number): TurnRequest {
  return { yaw: degrees(yaw), pitch: degrees(pitch) };
}
