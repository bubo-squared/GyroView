/**
 * Frames of the Insta360 Studio export of the sailing recording (`Jedrenje 360.mp4` beside it),
 * stitched and stabilized by Insta360's own software: the external reference for GyroView's
 * geometry. Extracted beforehand, scaled to the panorama size the tests render, with
 *
 *   ffmpeg -ss <t> -i "samples/sailing/Jedrenje 360.mp4" -frames:v 1 -vf scale=1536:768 \
 *     .artifacts/reference/studio-sailing-<t>s.png
 *
 * The export runs at 30 fps where the recording runs at 29.97, so its frame at `t` is the
 * recording's frame at `t * 30 / 29.97`.
 */
export interface ReferenceFrame {
  readonly time: number;
  readonly url: string;
}

const EXPORT_FRAME_RATE = 30;
const RECORDING_FRAME_RATE = 29.97;

export const STUDIO_SAILING_FRAMES: readonly ReferenceFrame[] = [
  {
    time: 100,
    url: new URL('../../../../.artifacts/reference/studio-sailing-100s.png', import.meta.url).href,
  },
  {
    time: 55,
    url: new URL('../../../../.artifacts/reference/studio-sailing-55s.png', import.meta.url).href,
  },
  {
    time: 170,
    url: new URL('../../../../.artifacts/reference/studio-sailing-170s.png', import.meta.url).href,
  },
];

/**
 * More frames of the same export, spread over the clip, extracted the same way: for a
 * measurement that near objects spoil on some frames, so that the median of many decides.
 */
export const STUDIO_SAILING_SPREAD: readonly ReferenceFrame[] = [
  ...STUDIO_SAILING_FRAMES,
  {
    time: 10,
    url: new URL('../../../../.artifacts/reference/studio-sailing-10s.png', import.meta.url).href,
  },
  {
    time: 20,
    url: new URL('../../../../.artifacts/reference/studio-sailing-20s.png', import.meta.url).href,
  },
  {
    time: 25,
    url: new URL('../../../../.artifacts/reference/studio-sailing-25s.png', import.meta.url).href,
  },
  {
    time: 40,
    url: new URL('../../../../.artifacts/reference/studio-sailing-40s.png', import.meta.url).href,
  },
  {
    time: 70,
    url: new URL('../../../../.artifacts/reference/studio-sailing-70s.png', import.meta.url).href,
  },
  {
    time: 85,
    url: new URL('../../../../.artifacts/reference/studio-sailing-85s.png', import.meta.url).href,
  },
  {
    time: 115,
    url: new URL('../../../../.artifacts/reference/studio-sailing-115s.png', import.meta.url).href,
  },
  {
    time: 130,
    url: new URL('../../../../.artifacts/reference/studio-sailing-130s.png', import.meta.url).href,
  },
  {
    time: 135,
    url: new URL('../../../../.artifacts/reference/studio-sailing-135s.png', import.meta.url).href,
  },
  {
    time: 145,
    url: new URL('../../../../.artifacts/reference/studio-sailing-145s.png', import.meta.url).href,
  },
  {
    time: 160,
    url: new URL('../../../../.artifacts/reference/studio-sailing-160s.png', import.meta.url).href,
  },
  {
    time: 185,
    url: new URL('../../../../.artifacts/reference/studio-sailing-185s.png', import.meta.url).href,
  },
];

/**
 * The recording's time of the export's frame at `time`.
 */
export function recordingTimeOf(frame: ReferenceFrame): number {
  return (frame.time * EXPORT_FRAME_RATE) / RECORDING_FRAME_RATE;
}

const RGBA = 4;
const OPAQUE = 255;
const LUMA_RED = 0.299;
const LUMA_GREEN = 0.587;
const LUMA_BLUE = 0.114;

/**
 * A grey image, rows from the top down, one byte per pixel.
 */
export interface GreyImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export async function loadGreyImage(url: string): Promise<GreyImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: greyOf(image.data, false, canvas) };
}

/**
 * The grey image drawn on a canvas, for saving.
 */
export function greyCanvasOf(image: GreyImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  const pixels = new ImageData(image.width, image.height);
  for (const [index, level] of image.data.entries()) {
    pixels.data.set([level, level, level, OPAQUE], index * RGBA);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * The luma of RGBA pixels, read from the top down; `isBottomUp` for what `readPixels` returns.
 */
export function greyOf(
  pixels: Uint8ClampedArray,
  isBottomUp: boolean,
  size: { readonly width: number; readonly height: number },
): Uint8Array {
  const { width, height } = size;
  const grey = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const sourceRow = isBottomUp ? height - 1 - row : row;
    for (let column = 0; column < width; column += 1) {
      const offset = (sourceRow * width + column) * RGBA;
      grey[row * width + column] = Math.round(
        (pixels[offset] ?? 0) * LUMA_RED +
          (pixels[offset + 1] ?? 0) * LUMA_GREEN +
          (pixels[offset + 2] ?? 0) * LUMA_BLUE,
      );
    }
  }
  return grey;
}
