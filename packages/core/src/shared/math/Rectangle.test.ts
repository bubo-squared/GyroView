import { describe, expect, it } from 'vitest';

import type { Rectangle, Size } from './Rectangle';

describe('Rectangle and Size', () => {
  it('keep the spaces apart, and take a plain literal in any of them', () => {
    const region: Rectangle<'frame fractions'> = { x: 0, y: 0, width: 0.5, height: 1 };
    // @ts-expect-error -- a frame region is no canvas window, although their fields agree
    const window: Rectangle<'canvas pixels'> = region;
    const canvas: Size<'canvas pixels'> = { width: 5376, height: 5376 };
    // @ts-expect-error -- a canvas's size is no viewport's
    const viewport: Size<'viewport'> = canvas;
    expect([window, viewport]).toEqual([region, canvas]);
  });
});
