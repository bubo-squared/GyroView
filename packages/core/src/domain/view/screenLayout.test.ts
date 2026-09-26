import { describe, expect, it } from 'vitest';

import { boundsOf, fittedRectangle, lensTiles, WHOLE_SCREEN } from './screenLayout';

describe('screen layout', () => {
  it('fits wider content across the whole width with bars above and below', () => {
    const fitted = fittedRectangle(2, 16 / 9);
    expect(fitted.x).toBe(0);
    expect(fitted.width).toBe(1);
    expect(fitted.height).toBeCloseTo(8 / 9, 12);
    expect(fitted.y).toBeCloseTo(1 / 18, 12);
  });

  it('fits narrower content across the whole height with bars at the sides', () => {
    const fitted = fittedRectangle(1, 2);
    expect(fitted).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });

  it('sets two square lens tiles side by side on a landscape viewport', () => {
    const [left, right] = lensTiles(2, 16 / 9);
    expect(left?.x).toBe(0);
    expect(left?.width).toBe(0.5);
    expect(left?.height).toBeCloseTo(8 / 9, 12);
    expect(left?.y).toBeCloseTo(1 / 18, 12);
    expect(right).toEqual({ ...left, x: 0.5 });
  });

  it('stacks the lens tiles when that gives the larger circles, as on a portrait viewport', () => {
    const [top, bottom] = lensTiles(2, 9 / 16);
    expect(top?.y).toBe(0);
    expect(top?.height).toBe(0.5);
    expect(top?.width).toBeCloseTo(8 / 9, 12);
    expect(top?.x).toBeCloseTo(1 / 18, 12);
    expect(bottom).toEqual({ ...top, y: 0.5 });
  });

  it('bounds the lens tiles by the rectangle they fill together', () => {
    expect(boundsOf(lensTiles(2, 1))).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 });
  });

  it('gives a single lens one square tile', () => {
    expect(lensTiles(1, 1)).toEqual([WHOLE_SCREEN]);
    expect(lensTiles(1, 2)).toEqual([{ x: 0.25, y: 0, width: 0.5, height: 1 }]);
  });

  it('fills the screen with content of the same shape', () => {
    expect(fittedRectangle(2, 2)).toEqual(WHOLE_SCREEN);
    expect(WHOLE_SCREEN).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});
