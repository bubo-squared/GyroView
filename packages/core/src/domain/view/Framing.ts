import { FITTED, isSameMagnification, type Magnification } from './magnification';
import { DEFAULT_VIEW, isSameView, type ViewState } from './ViewState';

/**
 * Everything that frames the picture, in every view mode: where the normal view looks, whose yaw
 * also turns the panorama, and how far the panorama and the lens tiles are magnified and moved.
 * Each mode changes its own part, so a detour through another mode loses nothing.
 */
export interface Framing {
  readonly view: ViewState;
  /**
   * Its centre stays in the middle across: the yaw turns the panorama sideways.
   */
  readonly panorama: Magnification;
  readonly lenses: Magnification;
}

export const DEFAULT_FRAMING: Framing = { view: DEFAULT_VIEW, panorama: FITTED, lenses: FITTED };

export function isSameFraming(a: Framing, b: Framing): boolean {
  return (
    isSameView(a.view, b.view) &&
    isSameMagnification(a.panorama, b.panorama) &&
    isSameMagnification(a.lenses, b.lenses)
  );
}

/**
 * The framing with the normal view replaced, the flat pictures' parts kept.
 */
export function withView(framing: Framing, view: ViewState): Framing {
  return { ...framing, view };
}

/**
 * The framing with the lens tiles' magnification replaced, the other parts kept.
 */
export function withLenses(framing: Framing, lenses: Magnification): Framing {
  return { ...framing, lenses };
}
