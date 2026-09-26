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

    it('ignores zoom, so the normal view comes back as it was', () => {
      const framing = framed(TILTED);
      expect(
        equirectangular.zoom(framing, { steps: 3, focus: { x: 0.2, y: 0.2 } }, SQUARE),
      ).toEqual(framing);
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

    it('ignores every gesture: the lens images are shown as recorded', () => {
      const framing = framed(TILTED);
      expect(rawLenses.canPan(framing)).toBe(false);
      expect(rawLenses.pan(framing, { x: 90, y: 90 }, SQUARE)).toEqual(framing);
      expect(rawLenses.turn(framing, turnOf(5, 5), SQUARE)).toEqual(framing);
      expect(rawLenses.zoom(framing, { steps: 2, focus: { x: 0.5, y: 0.5 } }, SQUARE)).toEqual(
        framing,
      );
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
