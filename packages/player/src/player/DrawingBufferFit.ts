import { clamp, DEFAULT_PICTURE_QUALITY, type PictureQuality } from '@gyroview/core';
import type { PictureRenderer, ViewportSize } from '@gyroview/core';

/**
 * The most device pixels per CSS pixel each quality draws: the screen's own ratio up to this.
 * Above two, the stitch's cost grows faster than what the eye gains from it, so only `high`
 * follows a phone's screen all the way (ADR 0024).
 */
const BUFFER_RATIO_CAPS: Readonly<Record<PictureQuality, number>> = {
  fast: 1,
  balanced: 2,
  high: 3,
};

/**
 * The drawing buffer size, in device pixels, for an element of the given CSS size on a screen
 * of the given pixel ratio, drawn at the given quality.
 */
export function drawingBufferSizeFor(
  cssSize: ViewportSize,
  devicePixelRatio: number,
  quality: PictureQuality = DEFAULT_PICTURE_QUALITY,
): ViewportSize {
  const ratio = clamp(devicePixelRatio, 1, BUFFER_RATIO_CAPS[quality]);
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
 * Keeps the renderer's drawing buffer matched to the canvas's layout size, the screen's pixel
 * ratio and the picture quality.
 */
export class DrawingBufferFit {
  private readonly observer: ResizeObserver;
  private readonly ratioWatch = new AbortController();
  private quality: PictureQuality = DEFAULT_PICTURE_QUALITY;

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

  public setQuality(quality: PictureQuality): void {
    this.quality = quality;
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
    const css = cssSizeOf(this.canvas);
    const size = drawingBufferSizeFor(css, globalThis.devicePixelRatio, this.quality);
    if (size.width === this.canvas.width && size.height === this.canvas.height) return;
    this.renderer.resize(size);
  }
}
