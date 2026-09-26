import { describe, expect, it } from 'vitest';

import { DEFAULT_FRAMING } from './Framing';
import { NORMAL_VIEW } from './normalView';
import { DEFAULT_VIEW, viewRotation } from './ViewState';
import { framed, SQUARE, TILTED, turnOf, ZOOMED_IN } from '../../../test/support/viewFixtures';

describe('the normal view', () => {
  it('drags by the field of view per viewport width, always', () => {
    const panned = NORMAL_VIEW.pan(DEFAULT_FRAMING, { x: 90, y: -90 }, SQUARE).view;
    expect(panned.yaw).toBeCloseTo(-9, 9);
    expect(panned.pitch).toBeCloseTo(-9, 9);
    expect(NORMAL_VIEW.canPan(DEFAULT_FRAMING)).toBe(true);
  });

  it('turns both ways', () => {
    expect(NORMAL_VIEW.turn(DEFAULT_FRAMING, turnOf(5, -5), SQUARE).view).toMatchObject({
      yaw: 5,
      pitch: -5,
    });
  });

  it('zooms in steps about the centre, and toward a point beside it', () => {
    const centre = { x: 0.5, y: 0.5 };
    const centred = NORMAL_VIEW.zoom(DEFAULT_FRAMING, { steps: 1, focus: centre }, SQUARE);
    expect(centred.view).toEqual({ ...DEFAULT_VIEW, fieldOfView: 90 / 1.1 });
    const right = { x: 0.9, y: 0.5 };
    const toTheRight = NORMAL_VIEW.zoom(DEFAULT_FRAMING, { steps: 1, focus: right }, SQUARE);
    expect(toTheRight.view.yaw).toBeGreaterThan(0);
  });

  it('resets its view and leaves the flat pictures as they are', () => {
    const framing = { ...framed(TILTED), lenses: ZOOMED_IN };
    expect(NORMAL_VIEW.reset(framing)).toEqual({ ...framing, view: DEFAULT_VIEW });
  });

  it('draws a rectilinear picture turned by the whole view over the whole screen', () => {
    expect(NORMAL_VIEW.picture(framed(TILTED), SQUARE)).toEqual({
      kind: 'rectilinear',
      rotation: viewRotation(TILTED),
      fieldOfView: 60,
      area: { x: 0, y: 0, width: 1, height: 1 },
    });
  });
});
