import { describe, expect, it } from 'vitest';

import {
  clampMagnification,
  FITTED,
  magnifiedArea,
  magnifyAt,
  MAX_MAGNIFICATION,
  panMagnification,
  type Magnification,
} from './magnification';
import { fittedRectangle, pictureAt, type ScreenPoint } from './screenLayout';

/**
 * A 2:1 panorama on a 16:9 viewport: the whole width, with bars above and below.
 */
const PANORAMA = fittedRectangle(2, 16 / 9);

function expectPoint(actual: ScreenPoint, expected: ScreenPoint): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
}

describe('magnification', () => {
  it('shows the fitted picture unchanged when nothing is magnified', () => {
    expect(magnifiedArea(PANORAMA, FITTED)).toEqual(PANORAMA);
  });

  it('keeps the scale between the fitted picture and eight times it', () => {
    expect(clampMagnification(PANORAMA, { ...FITTED, scale: 0.5 }).scale).toBe(1);
    expect(clampMagnification(PANORAMA, { ...FITTED, scale: 6 }).scale).toBe(6);
    expect(clampMagnification(PANORAMA, { ...FITTED, scale: 16 }).scale).toBe(MAX_MAGNIFICATION);
  });

  it('covers the viewport along an axis where the picture is larger, and centres it where smaller', () => {
    const wanted: Magnification = { scale: 1.5, centre: { x: 0.01, y: 0.9 } };
    const clamped = clampMagnification(PANORAMA, wanted);
    const area = magnifiedArea(PANORAMA, clamped);
    // 1.5 viewport widths across: the left edge of the picture meets the left of the viewport.
    expect(area.x).toBeCloseTo(0, 12);
    // 1.5 x 8/9 = 4/3 viewport heights: the bottom edge meets the bottom of the viewport.
    expect(area.y + area.height).toBeCloseTo(1, 12);

    const barely = clampMagnification(PANORAMA, { scale: 1.1, centre: { x: 0.5, y: 0.1 } });
    // 1.1 x 8/9 is still less than the viewport's height: the picture stays centred.
    expect(barely.centre.y).toBe(0.5);
  });

  it('keeps the point under the focus where it is while it magnifies', () => {
    const focus = { x: 0.8, y: 0.3 };
    const before = { scale: 2, centre: { x: 0.45, y: 0.55 } };
    const underFocus = pictureAt(magnifiedArea(PANORAMA, before), focus);

    const after = magnifyAt(PANORAMA, before, { steps: 3, focus });

    expect(after.scale).toBeCloseTo(2 * 1.1 ** 3, 12);
    expectPoint(pictureAt(magnifiedArea(PANORAMA, after), focus), underFocus);
  });

  it('magnifies about the centre for a focus at the centre, and returns to fitted when zoomed out', () => {
    const zoomed = magnifyAt(PANORAMA, FITTED, { steps: 5, focus: { x: 0.5, y: 0.5 } });
    expectPoint(zoomed.centre, { x: 0.5, y: 0.5 });
    const moved = panMagnification(PANORAMA, zoomed, { across: 0.2, down: -0.1 });
    expect(magnifyAt(PANORAMA, moved, { steps: -20, focus: { x: 0.9, y: 0.9 } })).toEqual(FITTED);
  });

  it('moves the picture with a shift, and stops it at its edges', () => {
    const zoomed = { scale: 2, centre: { x: 0.5, y: 0.5 } };
    const moved = panMagnification(PANORAMA, zoomed, { across: 0.1, down: 0 });
    // The picture moves right by a tenth of the viewport, a twentieth of its own width.
    expect(moved.centre.x).toBeCloseTo(0.45, 12);
    const far = panMagnification(PANORAMA, zoomed, { across: 5, down: -5 });
    const area = magnifiedArea(PANORAMA, far);
    expect(area.x).toBeCloseTo(0, 12);
    expect(area.y + area.height).toBeCloseTo(1, 12);
  });

  it('comes back to exactly fitted after zooming out notch by notch as far as it zoomed in', () => {
    const focus = { x: 0.3, y: 0.6 };
    for (const notches of [3, 4, 11]) {
      let magnification = FITTED;
      for (let notch = 0; notch < notches; notch += 1) {
        magnification = magnifyAt(PANORAMA, magnification, { steps: 1, focus });
      }
      for (let notch = 0; notch < notches; notch += 1) {
        magnification = magnifyAt(PANORAMA, magnification, { steps: -1, focus });
      }
      expect(magnification).toEqual(FITTED);
    }
  });

  it('does not move a fitted picture', () => {
    expect(panMagnification(PANORAMA, FITTED, { across: 0.3, down: 0.3 })).toEqual(FITTED);
  });
});
