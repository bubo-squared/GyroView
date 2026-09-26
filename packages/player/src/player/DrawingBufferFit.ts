import type { PictureRenderer, ViewportSize } from '@gyroview/core';

/**
 * Sharper than this on high-density screens costs GPU time the stitch does not repay.
 */
const MAX_DEVICE_PIXEL_RATIO = 2;

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
 * The element's size in CSS pixels as laid out on the page, transforms included, so that it is
 * measured as the pointer positions on it are.
 */
export function cssSizeOf(element: Element): ViewportSize {
  const { width, height } = element.getBoundingClientRect();
  return { width, height };
}

/**
 * Keeps the renderer's drawing buffer matched to the canvas's layout size.
 */
export class DrawingBufferFit {
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

  public dispose(): void {
    this.observer.disconnect();
  }

  private fit(): void {
    const size = drawingBufferSizeFor(cssSizeOf(this.canvas), window.devicePixelRatio);
    if (size.width === this.canvas.width && size.height === this.canvas.height) return;
    this.renderer.resize(size);
  }
}
