import { describe, expect, it } from 'vitest';

import { drawingBufferSizeFor } from './Viewport';

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
