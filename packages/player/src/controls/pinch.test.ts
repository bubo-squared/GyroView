import { describe, expect, it } from 'vitest';

import { distanceBetween } from './pinch';

describe('pinch', () => {
  it('measures the distance between two pointers', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
