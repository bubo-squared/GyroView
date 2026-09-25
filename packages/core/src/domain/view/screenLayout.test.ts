import { describe, expect, it } from 'vitest';

import { fittedRectangle, WHOLE_SCREEN } from './screenLayout';

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

  it('fills the screen with content of the same shape', () => {
    expect(fittedRectangle(2, 2)).toEqual(WHOLE_SCREEN);
    expect(WHOLE_SCREEN).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});
