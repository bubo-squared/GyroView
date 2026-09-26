import { describe, expect, it } from 'vitest';

import { DEFAULT_FRAMING, type Framing } from './Framing';
import { FITTED } from './magnification';
import { PANORAMA_VIEW } from './panoramaView';
import type { ViewContext } from './ViewMode';
import { transformVector } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';
import {
  framed,
  SQUARE,
  TILTED,
  turnOf,
  WIDE,
  ZOOMED_IN,
} from '../../../test/support/viewFixtures';

const FORWARD: Vector3 = [0, 0, 1];

function magnified(scale: number): Framing {
  return { ...DEFAULT_FRAMING, panorama: { scale, centre: { x: 0.5, y: 0.5 } } };
}

/**
 * The longitude and latitude a point of the viewport shows in the panorama.
 */
function pointAt(
  framing: Framing,
  context: ViewContext,
  point: { x: number; y: number },
): { longitude: number; latitude: number } {
  const picture = PANORAMA_VIEW.picture(framing, context);
  if (picture.kind !== 'equirectangular') throw new Error(`drew ${picture.kind}`);
  const { area } = picture;
  const across = (point.x - area.x) / area.width;
  const down = (point.y - area.y) / area.height;
  return { longitude: framing.view.yaw + (across - 0.5) * 360, latitude: (0.5 - down) * 180 };
}

describe('the panorama', () => {
  it('turns a whole turn per width of the picture as shown, and never tilts', () => {
    // Fitted, the picture is as wide as the viewport: 90 of 900 pixels is a tenth of a turn.
    const panned = PANORAMA_VIEW.pan(framed(TILTED), { x: 90, y: 200 }, SQUARE).view;
    expect(panned.yaw).toBeCloseTo(54, 9);
    expect(panned.pitch).toBe(30);
    // Twice as wide, the same drag turns it half as far.
    expect(PANORAMA_VIEW.pan(magnified(2), { x: 90, y: 0 }, SQUARE).view.yaw).toBeCloseTo(-18, 9);
    expect(PANORAMA_VIEW.canPan(DEFAULT_FRAMING)).toBe(true);
  });

  it('turns sideways with the arrows, and while fitted no more', () => {
    const turned = PANORAMA_VIEW.turn(framed(TILTED), turnOf(5, 5), SQUARE);
    expect(turned.view).toEqual({ ...TILTED, yaw: 95 });
    expect(turned.panorama).toEqual(FITTED);
  });

  it('zooms toward the pointer: the longitude and latitude under it stay put', () => {
    const focus = { x: 0.8, y: 0.3 };
    const framing = framed(TILTED);
    const zoomed = PANORAMA_VIEW.zoom(framing, { steps: 5, focus }, WIDE);
    const before = pointAt(framing, WIDE, focus);
    const after = pointAt(zoomed, WIDE, focus);
    expect(zoomed.panorama.scale).toBeCloseTo(1.1 ** 5, 9);
    expect(after.longitude).toBeCloseTo(before.longitude, 9);
    expect(after.latitude).toBeCloseTo(before.latitude, 9);
  });

  it('moves up and down by the share of the picture a drag passes, once taller than the viewport', () => {
    expect(PANORAMA_VIEW.pan(DEFAULT_FRAMING, { x: 0, y: 300 }, WIDE)).toEqual(DEFAULT_FRAMING);
    // Three times 8/9 of the viewport high: 90 of 900 pixels move it by 0.1 / (8/3) of itself.
    const dragged = PANORAMA_VIEW.pan(magnified(3), { x: 0, y: 90 }, WIDE);
    expect(dragged.panorama.centre.y).toBeCloseTo(0.5 - 0.0375, 9);
  });

  it('stops at its top and bottom', () => {
    const dragged = PANORAMA_VIEW.pan(magnified(3), { x: 0, y: 5000 }, WIDE);
    const picture = PANORAMA_VIEW.picture(dragged, WIDE);
    if (picture.kind !== 'equirectangular') throw new Error(`drew ${picture.kind}`);
    expect(picture.area.y).toBeCloseTo(0, 9);
  });

  it('moves up with the up arrow by the angle it names', () => {
    const raised = PANORAMA_VIEW.turn(magnified(3), turnOf(0, 9), WIDE);
    expect(raised.panorama.centre.y).toBeCloseTo(0.5 - 9 / 180, 9);
    expect(raised.view).toEqual(DEFAULT_FRAMING.view);
  });

  it('draws a magnified panorama grown about the point at the centre', () => {
    expect(PANORAMA_VIEW.picture(magnified(2), SQUARE)).toMatchObject({
      area: { x: -0.5, y: 0, width: 2, height: 1 },
    });
  });

  it('resets to straight ahead and fitted, keeping the normal view its pitch and field of view', () => {
    const reset = PANORAMA_VIEW.reset({ ...framed(TILTED), panorama: ZOOMED_IN });
    expect(reset).toEqual({ ...framed({ ...TILTED, yaw: degrees(0) }), panorama: FITTED });
  });

  it('stays level: turns by the yaw alone', () => {
    const picture = PANORAMA_VIEW.picture(framed(TILTED), SQUARE);
    if (picture.kind !== 'equirectangular') throw new Error(`drew ${picture.kind}`);
    const ahead = transformVector(picture.rotation, FORWARD);
    for (const [index, value] of [1, 0, 0].entries()) expect(ahead[index]).toBeCloseTo(value, 9);
  });

  it('draws a 2:1 panorama centred in the viewport', () => {
    expect(PANORAMA_VIEW.picture(framed(TILTED), SQUARE)).toMatchObject({
      kind: 'equirectangular',
      area: { x: 0, y: 0.25, width: 1, height: 0.5 },
    });
  });
});
