import {
  SEAM_STRIP_COLUMNS,
  SEAM_STRIP_ROWS,
  SEAM_CELL_SUBSAMPLES,
  SEAM_STRIP_STEP,
  SEAM_STRIP_THETA_START,
  degrees,
  degreesToRadians,
  transformVector,
  type CalibrationSet,
  type FramePair,
  type LensModel,
  type LensStitch,
  type StitchingSetup,
  type Vector3,
} from '@gyroview/core';

/**
 * The seam strip as each lens records it, drawn on the CPU through the core's own lens
 * models: an independent path beside the GPU meter, and a picture of what the meter compares.
 * One pixel per sub-sample of a strip cell.
 */
export interface StripImages {
  readonly width: number;
  readonly height: number;
  readonly lens0: ImageData;
  readonly lens1: ImageData;
  readonly difference: ImageData;
}

const RGBA = 4;
const RGB = 3;
const CHANNEL_MAX = 255;
const DIFFERENCE_GAIN = 4;
/**
 * Rec. 601 luma weights, as the meter compares the lenses.
 */
const LUMA_RED = 0.299;
const LUMA_GREEN = 0.587;
const LUMA_BLUE = 0.114;
/**
 * A sub-sample sits at the centre of its share of the cell.
 */
const CELL_CENTRE = 0.5;
const SHEET_ROWS = 3;

interface FramePixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * One lens as the strip reads it: its stitch geometry, its model and its frame's pixels.
 */
interface LensView {
  readonly lens: LensStitch;
  readonly model: LensModel;
  readonly pixels: FramePixels;
}

async function pixelsOf(frame: VideoFrame): Promise<FramePixels> {
  const bitmap = await createImageBitmap(frame);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: image.data, width: canvas.width, height: canvas.height };
}

function lumaAt(pixels: FramePixels, x: number, y: number): number {
  const column = Math.min(pixels.width - 1, Math.max(0, Math.round(x)));
  const row = Math.min(pixels.height - 1, Math.max(0, Math.round(y)));
  const offset = (row * pixels.width + column) * RGBA;
  const red = pixels.data[offset] ?? 0;
  const green = pixels.data[offset + 1] ?? 0;
  const blue = pixels.data[offset + 2] ?? 0;
  return (red * LUMA_RED + green * LUMA_GREEN + blue * LUMA_BLUE) / CHANNEL_MAX;
}

/**
 * The luma a lens records in a body direction, or undefined outside its image.
 */
function recordedLuma(view: LensView, direction: Vector3): number | undefined {
  const { lens, model, pixels } = view;
  const pixel = model.project(transformVector(lens.rotation, direction));
  if (!pixel) return undefined;
  const u = (pixel.x - lens.window.x) / lens.window.width;
  const v = (pixel.y - lens.window.y) / lens.window.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;
  const x = (lens.region.x + u * lens.region.width) * pixels.width;
  const y = (lens.region.y + v * lens.region.height) * pixels.height;
  return lumaAt(pixels, x, y);
}

function stripDirectionAt(column: number, row: number): Vector3 {
  const step = SEAM_STRIP_STEP / SEAM_CELL_SUBSAMPLES;
  const azimuth = degreesToRadians(degrees((column + CELL_CENTRE) * step));
  const theta = degreesToRadians(degrees(SEAM_STRIP_THETA_START + (row + CELL_CENTRE) * step));
  return [
    Math.sin(theta) * Math.cos(azimuth),
    Math.sin(theta) * Math.sin(azimuth),
    Math.cos(theta),
  ];
}

function setGrey(image: ImageData, offset: number, level: number): void {
  for (let channel = 0; channel < RGB; channel += 1) image.data[offset + channel] = level;
  image.data[offset + RGB] = CHANNEL_MAX;
}

function paintStrip(view: LensView, width: number, height: number): ImageData {
  const image = new ImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const luma = recordedLuma(view, stripDirectionAt(column, row));
      setGrey(image, (row * width + column) * RGBA, Math.round((luma ?? 0) * CHANNEL_MAX));
    }
  }
  return image;
}

function differenceOf(lens0: ImageData, lens1: ImageData): ImageData {
  const image = new ImageData(lens0.width, lens0.height);
  for (let offset = 0; offset < image.data.length; offset += RGBA) {
    const difference = Math.abs((lens0.data[offset] ?? 0) - (lens1.data[offset] ?? 0));
    setGrey(image, offset, Math.min(CHANNEL_MAX, DIFFERENCE_GAIN * difference));
  }
  return image;
}

async function viewsOf(
  setup: StitchingSetup,
  calibration: CalibrationSet,
  pair: FramePair<VideoFrame>,
): Promise<LensView[]> {
  const framePixels = await Promise.all(pair.frames.map((frame) => pixelsOf(frame.handle)));
  return setup.lenses.map((lens) => {
    const model = calibration.lenses.find((entry) => entry.lensIndex === lens.lensIndex)?.model;
    const pixels = framePixels[lens.frameSlot];
    if (!model || !pixels) throw new Error(`lens ${lens.lensIndex} has no frame`);
    return { lens, model, pixels };
  });
}

export async function stripImagesOf(
  setup: StitchingSetup,
  calibration: CalibrationSet,
  pair: FramePair<VideoFrame>,
): Promise<StripImages> {
  const width = SEAM_STRIP_COLUMNS * SEAM_CELL_SUBSAMPLES;
  const height = SEAM_STRIP_ROWS * SEAM_CELL_SUBSAMPLES;
  const [front, back] = await viewsOf(setup, calibration, pair);
  if (!front || !back) throw new Error('two lenses expected');
  const lens0 = paintStrip(front, width, height);
  const lens1 = paintStrip(back, width, height);
  return { width, height, lens0, lens1, difference: differenceOf(lens0, lens1) };
}

/**
 * The three strips stacked on one canvas: lens 0, lens 1, their difference.
 */
export function stripSheetOf(images: StripImages): HTMLCanvasElement {
  const sheet = document.createElement('canvas');
  sheet.width = images.width;
  sheet.height = SHEET_ROWS * images.height;
  const context = sheet.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.putImageData(images.lens0, 0, 0);
  context.putImageData(images.lens1, 0, images.height);
  context.putImageData(images.difference, 0, 2 * images.height);
  return sheet;
}
