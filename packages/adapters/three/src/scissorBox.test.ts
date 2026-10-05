import { describe, expect, it } from 'vitest';

import { scissorBoxOf } from './scissorBox';

const BUFFER = { width: 200, height: 100 };

describe('scissor boxes', () => {
  it('hold the whole buffer for a picture over the whole viewport', () => {
    expect(scissorBoxOf({ x: 0, y: 0, width: 1, height: 1 }, BUFFER).toArray()).toEqual([
      0, 0, 200, 100,
    ]);
  });

  it('hold a letterboxed picture and a pixel around it, counted from the bottom', () => {
    const area = { x: 0, y: 0.25, width: 1, height: 0.5 };
    expect(scissorBoxOf(area, BUFFER).toArray()).toEqual([0, 24, 200, 52]);
  });

  it('round outward an area whose edges fall inside pixels', () => {
    const area = { x: 0.1025, y: 0.105, width: 0.5, height: 0.5 };
    expect(scissorBoxOf(area, BUFFER).toArray()).toEqual([19, 38, 103, 53]);
  });

  it('hold just the margin for an area of no size at the edge', () => {
    const area = { x: 1, y: 0, width: 0, height: 1 };
    expect(scissorBoxOf(area, BUFFER).toArray()).toEqual([199, 0, 1, 100]);
  });
});
