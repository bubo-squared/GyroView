import type { ViewportSize } from '@gyroview/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawingBufferFit, drawingBufferSizeFor } from './DrawingBufferFit';

describe('drawingBufferSizeFor', () => {
  it('scales the CSS size by the device pixel ratio', () => {
    expect(drawingBufferSizeFor({ width: 300, height: 150 }, 1.5)).toEqual({
      width: 450,
      height: 225,
    });
  });

  it('caps the ratio at two and never goes below one', () => {
    expect(drawingBufferSizeFor({ width: 100, height: 50 }, 3)).toEqual({
      width: 200,
      height: 100,
    });
    expect(drawingBufferSizeFor({ width: 100, height: 50 }, 0.5)).toEqual({
      width: 100,
      height: 50,
    });
  });

  it('keeps at least one pixel each way for a collapsed element', () => {
    expect(drawingBufferSizeFor({ width: 0, height: 0 }, 2)).toEqual({ width: 1, height: 1 });
  });
});

describe('DrawingBufferFit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fits the buffer again when the window moves to a screen of another pixel ratio', () => {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width: 100px; height: 50px';
    document.body.append(canvas);
    const ratio = vi.spyOn(globalThis, 'devicePixelRatio', 'get').mockReturnValue(1);
    const ratioQueries: EventTarget[] = [];
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(() => {
      const query = new EventTarget();
      ratioQueries.push(query);
      return query as unknown as MediaQueryList;
    });
    const sizes: ViewportSize[] = [];
    const fit = new DrawingBufferFit(canvas, {
      resize: (size): void => {
        sizes.push(size);
        canvas.width = size.width;
        canvas.height = size.height;
      },
    });
    ratio.mockReturnValue(2);
    ratioQueries.at(-1)?.dispatchEvent(new Event('change'));
    ratio.mockReturnValue(1);
    ratioQueries.at(-1)?.dispatchEvent(new Event('change'));
    expect(sizes).toEqual([
      { width: 100, height: 50 },
      { width: 200, height: 100 },
      { width: 100, height: 50 },
    ]);
    fit.dispose();
    canvas.remove();
  });
});
