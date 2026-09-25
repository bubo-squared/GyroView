import type { PictureRenderer } from '@gyroview/core';

/**
 * Sharper than this on high-density screens costs GPU time the stitch does not repay.
 */
const MAX_DEVICE_PIXEL_RATIO = 2;

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The drawing buffer size, in device pixels, for an element of the given CSS size.
 */
export function drawingBufferSizeFor(
  cssSize: ViewportSize,
  devicePixelRatio: number,
): ViewportSize {
  const ratio = Math.min(Math.max(devicePixelRatio, 1), MAX_DEVICE_PIXEL_RATIO);
  return {
    width: Math.max(1, Math.round(cssSize.width * ratio)),
    height: Math.max(1, Math.round(cssSize.height * ratio)),
  };
}

/**
 * Keeps the renderer's drawing buffer matched to the canvas's layout size.
 */
export class Viewport {
  private readonly observer: ResizeObserver;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Pick<PictureRenderer, 'resize'>,
  ) {
    this.observer = new ResizeObserver(() => {
      this.fit();
    });
    this.observer.observe(canvas);
    this.fit();
  }

  public fit(): void {
    const rectangle = this.canvas.getBoundingClientRect();
    const size = drawingBufferSizeFor(rectangle, window.devicePixelRatio);
    if (size.width === this.canvas.width && size.height === this.canvas.height) return;
    this.renderer.resize(size.width, size.height);
  }

  public dispose(): void {
    this.observer.disconnect();
  }
}
