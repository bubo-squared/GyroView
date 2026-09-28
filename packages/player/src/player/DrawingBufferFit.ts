import { clamp } from '@gyroview/core';
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
  const ratio = clamp(devicePixelRatio, 1, MAX_DEVICE_PIXEL_RATIO);
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
 * Keeps the renderer's drawing buffer matched to the canvas's layout size and the screen's pixel
 * ratio.
 */
export class DrawingBufferFit {
  private readonly observer: ResizeObserver;
  private readonly ratioWatch = new AbortController();

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Pick<PictureRenderer, 'resize'>,
  ) {
    this.observer = new ResizeObserver(() => {
      this.fit();
    });
    this.observer.observe(canvas);
    this.watchPixelRatio();
    this.fit();
  }

  public dispose(): void {
    this.observer.disconnect();
    this.ratioWatch.abort();
  }

  /**
   * A window moved to a screen of another pixel ratio keeps its layout size, so the resize
   * observer stays quiet: a query for the ratio it has now says when that changes.
   */
  private watchPixelRatio(): void {
    const query = globalThis.matchMedia(`(resolution: ${globalThis.devicePixelRatio}dppx)`);
    const onChange = (): void => {
      this.fit();
      this.watchPixelRatio();
    };
    query.addEventListener('change', onChange, { once: true, signal: this.ratioWatch.signal });
  }

  private fit(): void {
    const size = drawingBufferSizeFor(cssSizeOf(this.canvas), globalThis.devicePixelRatio);
    if (size.width === this.canvas.width && size.height === this.canvas.height) return;
    this.renderer.resize(size);
  }
}
