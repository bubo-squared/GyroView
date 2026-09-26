import { describe, expect, it } from 'vitest';

import { DEFAULT_FRAMING, type Framing } from './Framing';
import { LENS_TILES_VIEW } from './lensTilesView';
import { FITTED } from './magnification';
import { lensTiles } from './screenLayout';
import { framed, SQUARE, TILTED, turnOf, ZOOMED_IN } from '../../../test/support/viewFixtures';

/**
 * Twice the fitted size, the middle of the pair of tiles at the centre.
 */
const TWICE: Framing = { ...DEFAULT_FRAMING, lenses: { scale: 2, centre: { x: 0.5, y: 0.5 } } };

describe('the raw lens tiles', () => {
  it('neither turn nor move while fitted', () => {
    const framing = framed(TILTED);
    expect(LENS_TILES_VIEW.canPan(framing)).toBe(false);
    expect(LENS_TILES_VIEW.pan(framing, { x: 90, y: 90 }, SQUARE)).toEqual(framing);
    expect(LENS_TILES_VIEW.turn(framing, turnOf(5, 5), SQUARE)).toEqual(framing);
  });

  it('zoom together toward the pointer', () => {
    // The centre of the left tile on a square viewport, where the tiles sit side by side.
    const focus = { x: 0.25, y: 0.5 };
    const zoomed = LENS_TILES_VIEW.zoom(DEFAULT_FRAMING, { steps: 3, focus }, SQUARE);
    const picture = LENS_TILES_VIEW.picture(zoomed, SQUARE);
    if (picture.kind !== 'lens-tiles') throw new Error(`drew ${picture.kind}`);
    const [left] = picture.tiles;
    expect((left?.x ?? 0) + (left?.width ?? 0) / 2).toBeCloseTo(0.25, 9);
    expect(LENS_TILES_VIEW.canPan(zoomed)).toBe(true);
  });

  it('move by the share of the zoomed tiles a drag passes', () => {
    // 30 of 900 pixels is a thirtieth of the viewport, a sixtieth of tiles twice as wide.
    const dragged = LENS_TILES_VIEW.pan(TWICE, { x: -30, y: 0 }, SQUARE);
    expect(dragged.lenses.centre.x).toBeCloseTo(0.5 + 1 / 60, 9);
  });

  it('move with the arrows as far as a drag of the same angle, a quarter turn per viewport width', () => {
    // 5 degrees is 50 of 900 pixels: an eighteenth of the viewport, a thirty-sixth of the tiles.
    const moved = LENS_TILES_VIEW.turn(TWICE, turnOf(5, 0), SQUARE);
    expect(moved.lenses.centre.x).toBeCloseTo(0.5 + 1 / 36, 9);
  });

  it('stay put again once zoomed back out as far as they zoomed in', () => {
    const centre = { x: 0.5, y: 0.5 };
    let framing = DEFAULT_FRAMING;
    for (const steps of [1, 1, 1, -1, -1, -1]) {
      framing = LENS_TILES_VIEW.zoom(framing, { steps, focus: centre }, SQUARE);
    }
    expect(LENS_TILES_VIEW.canPan(framing)).toBe(false);
  });

  it('are drawn magnified together', () => {
    expect(LENS_TILES_VIEW.picture(TWICE, SQUARE)).toEqual({
      kind: 'lens-tiles',
      tiles: [
        { x: -0.5, y: 0, width: 1, height: 1 },
        { x: 0.5, y: 0, width: 1, height: 1 },
      ],
    });
  });

  it('reset to fitted, and nothing else', () => {
    const framing = { ...framed(TILTED), lenses: ZOOMED_IN };
    expect(LENS_TILES_VIEW.reset(framing)).toEqual({ ...framing, lenses: FITTED });
  });

  it('draw every lens in its own square tile', () => {
    const portrait = { viewport: { width: 900, height: 1600 }, lensCount: 2 };
    expect(LENS_TILES_VIEW.picture(framed(TILTED), portrait)).toEqual({
      kind: 'lens-tiles',
      tiles: lensTiles(2, 900 / 1600),
    });
  });
});
