import type { CanvasSize } from './rendering';

/**
 * How far either side of each side seam the sheet shows, in degrees of longitude: the reach of
 * the seam strip.
 */
const BAND_HALF_WIDTH_DEGREES = 7;
const FULL_TURN_DEGREES = 360;
/**
 * The side seams sit a quarter turn either side of the panorama's centre.
 */
const LEFT_SEAM_FRACTION = 0.25;
const RIGHT_SEAM_FRACTION = 0.75;
const SEAM_LONGITUDE_FRACTIONS = [LEFT_SEAM_FRACTION, RIGHT_SEAM_FRACTION];
/**
 * The sheet's rows: lens 0, lens 1, their difference.
 */
const SHEET_ROWS = 3;
const GAP = 8;
const RGBA = 4;
const CHANNEL_MAX = 255;
/**
 * A difference is shown four times brighter than it is, so a few levels show.
 */
const DIFFERENCE_GAIN = 4;

/**
 * Equirectangular renders of the same moment, each lens alone, as `readPixels` returns them:
 * RGBA rows from the bottom up.
 */
export interface LensOnlyRenders {
  readonly lens0: Uint8ClampedArray;
  readonly lens1: Uint8ClampedArray;
  readonly size: CanvasSize;
}

/**
 * A picture of the two side seams: for each, the band around it from lens 0, from lens 1, and
 * their difference, stacked; the two seams side by side. Where the lenses agree, the third row
 * is dark and even.
 */
export function seamSheetOf(renders: LensOnlyRenders): HTMLCanvasElement {
  const { width, height } = renders.size;
  const halfBand = Math.round((BAND_HALF_WIDTH_DEGREES / FULL_TURN_DEGREES) * width);
  const bandWidth = 2 * halfBand;
  const sheet = document.createElement('canvas');
  sheet.width = SEAM_LONGITUDE_FRACTIONS.length * bandWidth + GAP;
  sheet.height = SHEET_ROWS * height;
  const context = sheet.getContext('2d');
  if (!context) throw new Error('no 2d context');
  for (const [seam, fraction] of SEAM_LONGITUDE_FRACTIONS.entries()) {
    const band: Band = { firstColumn: Math.round(fraction * width) - halfBand, width: bandWidth };
    const left = seam * (bandWidth + GAP);
    context.putImageData(bandOf(renders.lens0, renders, band), left, 0);
    context.putImageData(bandOf(renders.lens1, renders, band), left, height);
    context.putImageData(differenceBandOf(renders, band), left, 2 * height);
  }
  return sheet;
}

/**
 * A run of columns of the panorama.
 */
interface Band {
  readonly firstColumn: number;
  readonly width: number;
}

function bandOf(pixels: Uint8ClampedArray, renders: LensOnlyRenders, band: Band): ImageData {
  const { width, height } = renders.size;
  const { firstColumn, width: bandWidth } = band;
  const image = new ImageData(bandWidth, height);
  for (let row = 0; row < height; row += 1) {
    const sourceRow = height - 1 - row;
    for (let column = 0; column < bandWidth; column += 1) {
      const source = (sourceRow * width + firstColumn + column) * RGBA;
      const target = (row * bandWidth + column) * RGBA;
      image.data.set(pixels.subarray(source, source + RGBA), target);
      image.data[target + RGBA - 1] = CHANNEL_MAX;
    }
  }
  return image;
}

function differenceBandOf(renders: LensOnlyRenders, band: Band): ImageData {
  const { width, height } = renders.size;
  const { firstColumn, width: bandWidth } = band;
  const image = new ImageData(bandWidth, height);
  for (let row = 0; row < height; row += 1) {
    const sourceRow = height - 1 - row;
    for (let column = 0; column < bandWidth; column += 1) {
      const source = (sourceRow * width + firstColumn + column) * RGBA;
      const target = (row * bandWidth + column) * RGBA;
      for (let channel = 0; channel < RGBA - 1; channel += 1) {
        const difference = Math.abs(
          (renders.lens0[source + channel] ?? 0) - (renders.lens1[source + channel] ?? 0),
        );
        image.data[target + channel] = Math.min(CHANNEL_MAX, DIFFERENCE_GAIN * difference);
      }
      image.data[target + RGBA - 1] = CHANNEL_MAX;
    }
  }
  return image;
}
