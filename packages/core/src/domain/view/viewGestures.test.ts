import { describe, expect, it } from 'vitest';

import { directionAt } from './rectilinear';
import { SCREEN_CENTRE } from './screenLayout';
import { lookAt, panView, zoomStepsForPinch, zoomViewAt } from './viewGestures';
import { DEFAULT_VIEW, type ViewState } from './ViewState';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';

const VIEWPORT_WIDTH = 900;
const ASPECT = 16 / 9;

function viewOf(yaw: number, pitch: number, fieldOfView: number): ViewState {
  return {
    yaw: degrees(yaw),
    pitch: degrees(pitch),
    roll: degrees(0),
    fieldOfView: degrees(fieldOfView),
  };
}

/**
 * The default view zoomed by `steps` about the centre, as the keys zoom it.
 */
function centred(steps: number): ViewState {
  return zoomViewAt(DEFAULT_VIEW, { steps, focus: SCREEN_CENTRE }, ASPECT);
}

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 9);
}

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
    expect(centred(1).fieldOfView).toBeCloseTo(90 / 1.1, 9);
    expect(centred(-1).fieldOfView).toBeCloseTo(99, 9);
    expect(centred(20).fieldOfView).toBe(30);
    expect(centred(-20).fieldOfView).toBe(120);
  });

  it.each([
    { focus: { x: 0.8, y: 0.3 }, view: viewOf(0, 0, 100), steps: 3 },
    { focus: { x: 0.1, y: 0.9 }, view: viewOf(30, 20, 100), steps: 3 },
    { focus: { x: 0.95, y: 0.05 }, view: viewOf(-60, -40, 90), steps: 2 },
    { focus: { x: 0.2, y: 0.7 }, view: viewOf(170, 10, 60), steps: -2 },
  ])('keeps the direction under the pointer where it is: $focus', ({ focus, view, steps }) => {
    const underPointer = directionAt(view, focus, ASPECT);
    const zoomed = zoomViewAt(view, { steps, focus }, ASPECT);
    expect(zoomed.fieldOfView).toBeCloseTo(view.fieldOfView / 1.1 ** steps, 9);
    expectVector(directionAt(zoomed, focus, ASPECT), underPointer);
  });

  it('zooms about the centre like the centred zoom for a pointer at the centre', () => {
    const view = viewOf(40, -15, 90);
    const zoomed = zoomViewAt(view, { steps: 2, focus: SCREEN_CENTRE }, ASPECT);
    expect(zoomed).toEqual({ ...view, fieldOfView: 90 / 1.1 ** 2 });
  });

  it('only changes the field of view once it is at its limit', () => {
    const widest = viewOf(10, 5, 120);
    expect(zoomViewAt(widest, { steps: -1, focus: { x: 0.9, y: 0.2 } }, ASPECT)).toEqual(widest);
  });

  it('zooms about the centre when no turn near the zenith keeps the pointed direction', () => {
    const view = viewOf(0, 60, 90);
    const zoomed = zoomViewAt(view, { steps: -1, focus: { x: 0.05, y: 0.02 } }, ASPECT);
    expect(zoomed.yaw).toBe(0);
    expect(zoomed.pitch).toBe(60);
    expect(zoomed.fieldOfView).toBeCloseTo(99, 9);
  });

  it('keeps the roll the device gave the view through every gesture', () => {
    const rolled = { ...viewOf(20, 10, 90), roll: degrees(25) };
    expect(panView(rolled, { x: 90, y: 90 }, VIEWPORT_WIDTH).roll).toBe(25);
    expect(zoomViewAt(rolled, { steps: 1, focus: SCREEN_CENTRE }, ASPECT).roll).toBe(25);
    expect(zoomViewAt(rolled, { steps: 1, focus: { x: 0.8, y: 0.3 } }, ASPECT).roll).toBe(25);
    expect(lookAt(rolled, degrees(5), degrees(5)).roll).toBe(25);
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
