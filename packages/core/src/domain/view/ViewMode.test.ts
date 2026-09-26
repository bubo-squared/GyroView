import { describe, expect, it } from 'vitest';

import { DEFAULT_FRAMING, type Framing } from './Framing';
import { FITTED } from './magnification';
import { lensTiles } from './screenLayout';
import type { TurnRequest } from './viewGestures';
import { DEFAULT_VIEW_MODE, VIEW_MODES, viewModeRulesFor, type ViewContext } from './ViewMode';
import { DEFAULT_VIEW, viewRotation, type ViewState } from './ViewState';
import { transformVector } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';

/**
 * A square viewport, 900 CSS pixels a side, with the two lenses of every accepted layout.
 */
const SQUARE: ViewContext = { viewport: { width: 900, height: 900 }, lensCount: 2 };
const FORWARD: Vector3 = [0, 0, 1];
const TILTED: ViewState = {
  yaw: degrees(90),
  pitch: degrees(30),
  fieldOfView: degrees(60),
};
const ZOOMED_IN = { scale: 2, centre: { x: 0.4, y: 0.6 } };
/**
 * A 16:9 viewport, where the fitted panorama leaves bars above and below.
 */
const WIDE: ViewContext = { viewport: { width: 1600, height: 900 }, lensCount: 2 };

/**
 * The longitude and latitude a point of the viewport shows in an equirectangular picture.
 */
function panoramaPointAt(
  framing: Framing,
  context: ViewContext,
  point: { x: number; y: number },
): { longitude: number; latitude: number } {
  const picture = viewModeRulesFor('equirectangular').picture(framing, context);
  if (picture.kind !== 'equirectangular') throw new Error(`drew ${picture.kind}`);
  const { area } = picture;
  const across = (point.x - area.x) / area.width;
  const down = (point.y - area.y) / area.height;
  return { longitude: framing.view.yaw + (across - 0.5) * 360, latitude: (0.5 - down) * 180 };
}

function framed(view: ViewState): Framing {
  return { ...DEFAULT_FRAMING, view };
}

function turnOf(yaw: number, pitch: number): TurnRequest {
  return { yaw: degrees(yaw), pitch: degrees(pitch) };
}

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

describe('view modes', () => {
  it('offers the normal view first and by default', () => {
    expect(VIEW_MODES).toEqual(['normal', 'equirectangular', 'raw-lenses']);
    expect(DEFAULT_VIEW_MODE).toBe('normal');
  });

  it('stabilizes the stitched modes and leaves the raw lenses as recorded', () => {
    const stabilized = VIEW_MODES.filter((mode) => viewModeRulesFor(mode).isStabilized);
    expect(stabilized).toEqual(['normal', 'equirectangular']);
  });

  describe('normal', () => {
    const normal = viewModeRulesFor('normal');

    it('drags by the field of view per viewport width, always', () => {
      const panned = normal.pan(DEFAULT_FRAMING, { x: 90, y: -90 }, SQUARE).view;
      expect(panned.yaw).toBeCloseTo(-9, 9);
      expect(panned.pitch).toBeCloseTo(-9, 9);
      expect(normal.canPan(DEFAULT_FRAMING)).toBe(true);
    });

    it('turns both ways', () => {
      expect(normal.turn(DEFAULT_FRAMING, turnOf(5, -5), SQUARE).view).toMatchObject({
        yaw: 5,
        pitch: -5,
      });
    });

    it('zooms in steps about the centre, and toward a point beside it', () => {
      const centred = normal.zoom(DEFAULT_FRAMING, { steps: 1, focus: { x: 0.5, y: 0.5 } }, SQUARE);
      expect(centred.view.fieldOfView).toBeCloseTo(90 / 1.1, 9);
      expect(centred.view.yaw).toBeCloseTo(0, 9);
      const toTheRight = normal.zoom(
        DEFAULT_FRAMING,
        { steps: 1, focus: { x: 0.9, y: 0.5 } },
        SQUARE,
      );
      expect(toTheRight.view.yaw).toBeGreaterThan(0);
    });

    it('resets its view and leaves the flat pictures as they are', () => {
      const framing = { ...framed(TILTED), lenses: ZOOMED_IN };
      expect(normal.reset(framing)).toEqual({ ...framing, view: DEFAULT_VIEW });
    });

    it('draws a rectilinear picture turned by the whole view over the whole screen', () => {
      expect(normal.picture(framed(TILTED), SQUARE)).toEqual({
        kind: 'rectilinear',
        rotation: viewRotation(TILTED),
        fieldOfView: 60,
        area: { x: 0, y: 0, width: 1, height: 1 },
      });
    });
  });

  describe('equirectangular', () => {
    const equirectangular = viewModeRulesFor('equirectangular');

    it('drags a whole turn across the viewport and never tilts', () => {
      const panned = equirectangular.pan(framed(TILTED), { x: 90, y: 200 }, SQUARE).view;
      expect(panned.yaw).toBeCloseTo(54, 9);
      expect(panned.pitch).toBe(30);
      expect(equirectangular.canPan(DEFAULT_FRAMING)).toBe(true);
    });

    it('turns sideways only', () => {
      expect(equirectangular.turn(framed(TILTED), turnOf(5, 5), SQUARE).view).toEqual({
        ...TILTED,
        yaw: 95,
      });
    });

    it('zooms toward the pointer: the longitude and latitude under it stay put', () => {
      const focus = { x: 0.8, y: 0.3 };
      const framing = framed(TILTED);
      const zoomed = equirectangular.zoom(framing, { steps: 5, focus }, WIDE);
      const before = panoramaPointAt(framing, WIDE, focus);
      const after = panoramaPointAt(zoomed, WIDE, focus);
      expect(zoomed.panorama.scale).toBeCloseTo(1.1 ** 5, 9);
      expect(after.longitude).toBeCloseTo(before.longitude, 9);
      expect(after.latitude).toBeCloseTo(before.latitude, 9);
      expect(zoomed.view.fieldOfView).toBe(TILTED.fieldOfView);
      expect(zoomed.view.pitch).toBe(TILTED.pitch);
    });

    it('moves up and down only once taller than the viewport, and stops at its edges', () => {
      expect(equirectangular.pan(DEFAULT_FRAMING, { x: 0, y: 300 }, WIDE)).toEqual(DEFAULT_FRAMING);
      const zoomed = { ...DEFAULT_FRAMING, panorama: { scale: 3, centre: { x: 0.5, y: 0.5 } } };
      const dragged = equirectangular.pan(zoomed, { x: 0, y: 5000 }, WIDE);
      const picture = equirectangular.picture(dragged, WIDE);
      if (picture.kind !== 'equirectangular') throw new Error(`drew ${picture.kind}`);
      expect(picture.area.y).toBeCloseTo(0, 9);
    });

    it('moves a zoomed panorama up with the up arrow by the angle it names', () => {
      const zoomed = { ...DEFAULT_FRAMING, panorama: { scale: 3, centre: { x: 0.5, y: 0.5 } } };
      const raised = equirectangular.turn(zoomed, turnOf(0, 9), WIDE);
      expect(raised.panorama.centre.y).toBeCloseTo(0.5 - 9 / 180, 9);
      expect(raised.view).toEqual(zoomed.view);
    });

    it('draws a magnified panorama grown about the point at the centre, always level', () => {
      const zoomed = { ...DEFAULT_FRAMING, panorama: { scale: 2, centre: { x: 0.5, y: 0.5 } } };
      expect(equirectangular.picture(zoomed, SQUARE)).toMatchObject({
        area: { x: -0.5, y: 0, width: 2, height: 1 },
      });
    });

    it('resets to straight ahead and fitted, keeping the normal view pitch and field of view', () => {
      const reset = equirectangular.reset({ ...framed(TILTED), panorama: ZOOMED_IN });
      expect(reset).toEqual({ ...framed({ ...TILTED, yaw: degrees(0) }), panorama: FITTED });
    });

    it('stays level: turns by the yaw alone', () => {
      const picture = equirectangular.picture(framed(TILTED), SQUARE);
      if (picture.kind !== 'equirectangular') throw new Error(`drew ${picture.kind}`);
      expectVector(transformVector(picture.rotation, FORWARD), [1, 0, 0]);
    });

    it('draws a 2:1 panorama centred in the viewport', () => {
      expect(equirectangular.picture(framed(TILTED), SQUARE)).toMatchObject({
        kind: 'equirectangular',
        area: { x: 0, y: 0.25, width: 1, height: 0.5 },
      });
    });
  });

  describe('raw lenses', () => {
    const rawLenses = viewModeRulesFor('raw-lenses');

    it('neither turns nor moves the fitted lens images', () => {
      const framing = framed(TILTED);
      expect(rawLenses.canPan(framing)).toBe(false);
      expect(rawLenses.pan(framing, { x: 90, y: 90 }, SQUARE)).toEqual(framing);
      expect(rawLenses.turn(framing, turnOf(5, 5), SQUARE)).toEqual(framing);
    });

    it('zooms the tiles together toward the pointer, then moves with drags and arrows', () => {
      // The centre of the left tile on a square viewport, where the tiles sit side by side.
      const focus = { x: 0.25, y: 0.5 };
      const zoomed = rawLenses.zoom(DEFAULT_FRAMING, { steps: 3, focus }, SQUARE);
      const picture = rawLenses.picture(zoomed, SQUARE);
      if (picture.kind !== 'lens-tiles') throw new Error(`drew ${picture.kind}`);
      const [left] = picture.tiles;
      expect((left?.x ?? 0) + (left?.width ?? 0) / 2).toBeCloseTo(0.25, 9);
      expect(rawLenses.canPan(zoomed)).toBe(true);
      expect(rawLenses.pan(zoomed, { x: -30, y: 0 }, SQUARE).lenses.centre.x).toBeGreaterThan(
        zoomed.lenses.centre.x,
      );
      expect(rawLenses.turn(zoomed, turnOf(5, 0), SQUARE).lenses.centre.x).toBeGreaterThan(
        zoomed.lenses.centre.x,
      );
      expect(zoomed.view).toEqual(DEFAULT_FRAMING.view);
    });

    it('stays put again once zoomed back out as far as it zoomed in', () => {
      const centre = { x: 0.5, y: 0.5 };
      let framing = DEFAULT_FRAMING;
      for (const steps of [1, 1, 1, -1, -1, -1]) {
        framing = rawLenses.zoom(framing, { steps, focus: centre }, SQUARE);
      }
      expect(rawLenses.canPan(framing)).toBe(false);
    });

    it('draws the tiles magnified together', () => {
      const zoomed = { ...DEFAULT_FRAMING, lenses: { scale: 2, centre: { x: 0.5, y: 0.5 } } };
      expect(rawLenses.picture(zoomed, SQUARE)).toEqual({
        kind: 'lens-tiles',
        tiles: [
          { x: -0.5, y: 0, width: 1, height: 1 },
          { x: 0.5, y: 0, width: 1, height: 1 },
        ],
      });
    });

    it('resets the lens tiles to fitted and nothing else', () => {
      const framing = { ...framed(TILTED), lenses: ZOOMED_IN };
      expect(rawLenses.reset(framing)).toEqual({ ...framing, lenses: FITTED });
    });

    it('draws every lens in its own square tile', () => {
      const portrait = { viewport: { width: 900, height: 1600 }, lensCount: 2 };
      expect(rawLenses.picture(framed(TILTED), portrait)).toEqual({
        kind: 'lens-tiles',
        tiles: lensTiles(2, 900 / 1600),
      });
    });
  });
});
