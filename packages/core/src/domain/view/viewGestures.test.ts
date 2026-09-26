import { describe, expect, it } from 'vitest';

import { lookAt, panView, zoomStepsForPinch, zoomView } from './viewGestures';
import { DEFAULT_VIEW } from './ViewState';
import { degrees } from '../../shared/units/angle';

const VIEWPORT_WIDTH = 900;

describe('view gestures', () => {
  it('drags the picture: a drag to the right turns the viewer left by the covered angle', () => {
    const panned = panView(DEFAULT_VIEW, { x: 90, y: 0 }, VIEWPORT_WIDTH);
    expect(panned.yaw).toBeCloseTo(-9, 9);
    expect(panned.pitch).toBe(0);
  });

  it('drags the picture down to look up, and never past the poles', () => {
    expect(panView(DEFAULT_VIEW, { x: 0, y: 450 }, VIEWPORT_WIDTH).pitch).toBeCloseTo(45, 9);
    expect(panView(DEFAULT_VIEW, { x: 0, y: 2000 }, VIEWPORT_WIDTH).pitch).toBe(90);
  });

  it('covers fewer degrees per pixel when zoomed in', () => {
    const zoomedIn = { ...DEFAULT_VIEW, fieldOfView: degrees(45) };
    expect(panView(zoomedIn, { x: 90, y: 0 }, VIEWPORT_WIDTH).yaw).toBeCloseTo(-4.5, 9);
  });

  it('zooms in steps and stays within the field of view range', () => {
    expect(zoomView(DEFAULT_VIEW, 1).fieldOfView).toBeCloseTo(90 / 1.1, 9);
    expect(zoomView(DEFAULT_VIEW, -1).fieldOfView).toBeCloseTo(99, 9);
    expect(zoomView(DEFAULT_VIEW, 20).fieldOfView).toBe(30);
    expect(zoomView(DEFAULT_VIEW, -20).fieldOfView).toBe(120);
  });

  it('looks at a direction with the same clamping as every change', () => {
    expect(lookAt(DEFAULT_VIEW, degrees(270), degrees(-100))).toEqual({
      ...DEFAULT_VIEW,
      yaw: -90,
      pitch: -90,
    });
  });
});

describe('pinch zoom', () => {
  it('turns a spreading pinch into positive zoom steps and a closing one into negative', () => {
    expect(zoomStepsForPinch(100, 110)).toBeCloseTo(1, 6);
    expect(zoomStepsForPinch(110, 100)).toBeCloseTo(-1, 6);
    expect(zoomStepsForPinch(100, 100)).toBe(0);
  });

  it('ignores degenerate distances', () => {
    expect(zoomStepsForPinch(0, 50)).toBe(0);
    expect(zoomStepsForPinch(50, 0)).toBe(0);
  });
});
