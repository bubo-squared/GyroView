import {
  clamp,
  DEFAULT_PICTURE_QUALITY,
  pixelRatioCapOf,
  type PictureQuality,
} from '@gyroview/core';
import type { PictureRenderer, ViewportSize } from '@gyroview/core';

/**
 * How far, in device pixels, a box's own count may be from its CSS size at the ratio and still be
 * its size now: a side rounds to a whole pixel, so less than one.
 */
const DEVICE_PIXEL_SLACK = 1;

/**
 * A canvas as measured: its CSS size, the screen's pixel ratio and, where the browser counts them,
 * the device pixels of its box. At a fractional ratio (1.25, 1.5) rounding the CSS size can miss
 * that count by one, and the browser then stretches the whole picture onto the box, blurred.
 */
export interface CanvasMeasure {
  readonly css: ViewportSize;
  readonly devicePixelRatio: number;
  readonly devicePixels?: ViewportSize;
}

/**
 * The drawing buffer size, in device pixels, for a canvas so measured, drawn at the given quality:
 * the box's own device pixels where the buffer is to have as many and they agree with its CSS size
 * now, else the CSS size at the ratio the quality allows.
 */
export function drawingBufferSizeFor(
  measure: CanvasMeasure,
  quality: PictureQuality = DEFAULT_PICTURE_QUALITY,
): ViewportSize {
  const { css, devicePixelRatio, devicePixels } = measure;
  const ratio = clamp(devicePixelRatio, 1, pixelRatioCapOf(quality));
  const scaled = { width: css.width * ratio, height: css.height * ratio };
  const isExact = ratio === devicePixelRatio && devicePixels && isNear(devicePixels, scaled);
  const size = isExact ? devicePixels : scaled;
  return {
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
  };
}

function isNear(counted: ViewportSize, scaled: ViewportSize): boolean {
  return (
    Math.abs(counted.width - scaled.width) < DEVICE_PIXEL_SLACK &&
    Math.abs(counted.height - scaled.height) < DEVICE_PIXEL_SLACK
  );
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
  /**
   * The canvas box's device pixels as last observed, where the browser counts them.
   */
  private devicePixels: ViewportSize | undefined;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Pick<PictureRenderer, 'resize'>,
  ) {
    this.observer = new ResizeObserver((entries) => {
      this.devicePixels = devicePixelsOf(entries);
      this.fit();
    });
    this.observer.observe(canvas, { box: observedBox() });
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
    const measure = {
      css: cssSizeOf(this.canvas),
      devicePixelRatio: globalThis.devicePixelRatio,
      ...(this.devicePixels && { devicePixels: this.devicePixels }),
    };
    const size = drawingBufferSizeFor(measure, this.quality);
    if (size.width === this.canvas.width && size.height === this.canvas.height) return;
    this.renderer.resize(size);
  }
}

/**
 * The box observed: its device pixels where the browser counts them, which a move to a screen of
 * another ratio changes as well; Safari does not, and refuses to be asked for them. Asked once a
 * canvas is fitted, so that importing the package outside a browser touches no browser global.
 */
function observedBox(): ResizeObserverBoxOptions {
  return 'devicePixelContentBoxSize' in ResizeObserverEntry.prototype
    ? 'device-pixel-content-box'
    : 'content-box';
}

/**
 * The device pixels of the canvas's box in the latest observation, its inline size its width as
 * a canvas lays out; undefined where the browser does not count them.
 */
function devicePixelsOf(entries: readonly ResizeObserverEntry[]): ViewportSize | undefined {
  const [box] = entries.at(-1)?.devicePixelContentBoxSize ?? [];
  return box && { width: box.inlineSize, height: box.blockSize };
}
