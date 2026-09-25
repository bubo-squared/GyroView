/**
 * A rectangle of the viewport as fractions of its width and height, from the top-left corner.
 */
export interface ScreenRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const WHOLE_SCREEN: ScreenRectangle = { x: 0, y: 0, width: 1, height: 1 };

const CENTRE = 0.5;

/**
 * The largest centred rectangle of the content's shape inside the viewport. Both aspects are
 * width over height; the bars it leaves go above and below wider content, beside narrower.
 */
export function fittedRectangle(contentAspect: number, viewportAspect: number): ScreenRectangle {
  if (contentAspect >= viewportAspect) {
    const height = viewportAspect / contentAspect;
    return { x: 0, y: (1 - height) * CENTRE, width: 1, height };
  }
  const width = contentAspect / viewportAspect;
  return { x: (1 - width) * CENTRE, y: 0, width, height: 1 };
}
