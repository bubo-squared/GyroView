import { describe, expect, it } from 'vitest';

import { distanceBetween, zoomStepsForPinch } from './pinch';

describe('pinch', () => {
  it('measures the distance between two pointers', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

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
