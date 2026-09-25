import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_MODE, VIEW_MODES, viewModeRulesFor } from './ViewMode';
import { DEFAULT_VIEW, viewRotation } from './ViewState';
import { transformVector } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';

const VIEWPORT_WIDTH = 900;
const FORWARD: Vector3 = [0, 0, 1];
const TILTED = { ...DEFAULT_VIEW, yaw: degrees(90), pitch: degrees(30), fieldOfView: degrees(60) };

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

describe('view modes', () => {
  it('offers the normal view first and by default', () => {
    expect(VIEW_MODES).toEqual(['normal', 'equirectangular']);
    expect(DEFAULT_VIEW_MODE).toBe('normal');
  });

  describe('normal', () => {
    const normal = viewModeRulesFor('normal');

    it('drags by the field of view per viewport width and turns both ways', () => {
      const panned = normal.pan(DEFAULT_VIEW, { x: 90, y: -90 }, VIEWPORT_WIDTH);
      expect(panned.yaw).toBeCloseTo(-9, 9);
      expect(panned.pitch).toBeCloseTo(-9, 9);
      expect(normal.turn(DEFAULT_VIEW, degrees(5), degrees(-5))).toMatchObject({
        yaw: 5,
        pitch: -5,
      });
    });

    it('zooms and draws with the full view rotation over the whole screen', () => {
      expect(normal.zoom(DEFAULT_VIEW, 1).fieldOfView).toBeCloseTo(90 / 1.1, 9);
      expect(normal.rotation(TILTED)).toEqual(viewRotation(TILTED));
      expect(normal.screenAreas(16 / 9)).toEqual([{ x: 0, y: 0, width: 1, height: 1 }]);
    });
  });

  describe('equirectangular', () => {
    const equirectangular = viewModeRulesFor('equirectangular');

    it('drags a whole turn across the viewport and never tilts', () => {
      const panned = equirectangular.pan(TILTED, { x: 90, y: 200 }, VIEWPORT_WIDTH);
      expect(panned.yaw).toBeCloseTo(54, 9);
      expect(panned.pitch).toBe(30);
      expect(equirectangular.turn(TILTED, degrees(5), degrees(5))).toEqual({
        ...TILTED,
        yaw: 95,
      });
    });

    it('ignores zoom, so the normal view comes back as it was', () => {
      expect(equirectangular.zoom(TILTED, 3)).toEqual(TILTED);
    });

    it('stays level: turns by the yaw alone', () => {
      expectVector(transformVector(equirectangular.rotation(TILTED), FORWARD), [1, 0, 0]);
    });

    it('draws a 2:1 panorama centred in the viewport', () => {
      const [area] = equirectangular.screenAreas(16 / 9);
      expect(area?.width).toBe(1);
      expect(area?.height).toBeCloseTo(8 / 9, 12);
      expect(equirectangular.screenAreas(1)).toEqual([{ x: 0, y: 0.25, width: 1, height: 0.5 }]);
    });
  });
});
