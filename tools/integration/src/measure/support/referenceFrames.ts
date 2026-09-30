import { seconds, type Seconds } from '@gyroview/core';
import { inject } from 'vitest';

import { LOCAL_SAMPLES } from '../../browser/localSamples';
import { OFFICE_5K7_60, SAILING_8K_30, type SampleRecording } from '../../browser/sampleUrls';

/**
 * A frame of an Insta360 Studio export, stitched and stabilized by Insta360's own software:
 * the external reference for GyroView's geometry. `time` is the export's own.
 */
export interface ReferenceFrame {
  readonly time: Seconds;
  readonly url: string;
}

/**
 * The size of the panoramas compared with the Studio frames, and so of the frames extracted.
 */
export const REFERENCE_PANORAMA_SIZE = { width: 1536, height: 768 } as const;

/**
 * A recording and frames of its Studio export, extracted beforehand at
 * {@link REFERENCE_PANORAMA_SIZE} with
 *
 *   ffmpeg -ss <t> -i <export> -frames:v 1 -vf scale=1536:768 \
 *     .artifacts/reference/studio-<slug>-<t>s.png
 *
 * and, from an HLG export, with its own matrix and range, keeping the code values the lab draws
 * a recording's texels as (`scale=1536:768:in_color_matrix=bt2020:in_range=tv:out_range=pc`).
 */
export interface ReferenceClip {
  readonly slug: string;
  readonly sample: SampleRecording;
  /**
   * The recording's time at the export's first frame. Studio keeps the recording's clock at its
   * own frame rate: cross-correlating the frame-to-frame change of the export and of both lenses
   * matches them within a frame (office at 0 and 200 s, sailing at 150 s).
   */
  readonly start: Seconds;
  readonly frames: readonly ReferenceFrame[];
  /**
   * The frames the lens readings, the slowest measurement, are scored on.
   */
  readonly comparedTimes: readonly number[];
}

/**
 * Frames every 15 seconds from the tenth, so that the median of many decides a measurement
 * that near objects spoil on some.
 */
const FIRST_FRAME_SECONDS = 10;
const FRAME_SPACING_SECONDS = 15;

function framesOf(slug: string, count: number): ReferenceFrame[] {
  return framesAt(
    slug,
    Array.from(
      { length: count },
      (_, index) => FIRST_FRAME_SECONDS + index * FRAME_SPACING_SECONDS,
    ),
  );
}

function framesAt(slug: string, times: readonly number[]): ReferenceFrame[] {
  return times.map((time) => ({
    time: seconds(time),
    url: `${inject('referenceFolder')}studio-${slug}-${time}s.png`,
  }));
}

/**
 * The frames of both X5 exports the lens readings are scored on: early, midway and late, seven
 * readings a frame taking half a minute each.
 */
const X5_EARLY_COMPARED_SECONDS = 55;
const X5_MIDWAY_COMPARED_SECONDS = 100;
const X5_LATE_COMPARED_SECONDS = 175;
const X5_COMPARED_TIMES = [
  X5_EARLY_COMPARED_SECONDS,
  X5_MIDWAY_COMPARED_SECONDS,
  X5_LATE_COMPARED_SECONDS,
];

/**
 * `Jedrenje 360.mp4` beside the sailing recording: 8K at 30 fps, the whole clip, 194 s.
 */
const SAILING_FRAME_COUNT = 13;

const STUDIO_SAILING: ReferenceClip = {
  slug: 'sailing',
  sample: SAILING_8K_30,
  start: seconds(0),
  frames: framesOf('sailing', SAILING_FRAME_COUNT),
  comparedTimes: X5_COMPARED_TIMES,
};

/**
 * `Carigradska.mp4` beside the office recording: 5.7K at 60 fps, trimmed at both ends to 256 s.
 */
const OFFICE_FRAME_COUNT = 17;
const OFFICE_START_SECONDS = 2.98;

const STUDIO_OFFICE: ReferenceClip = {
  slug: 'office',
  sample: OFFICE_5K7_60,
  start: seconds(OFFICE_START_SECONDS),
  frames: framesOf('office', OFFICE_FRAME_COUNT),
  comparedTimes: X5_COMPARED_TIMES,
};

/**
 * The Studio exports of the local samples (ADR 0031), their frames at the times the catalogue
 * names.
 */
const LOCAL_STUDIO_CLIPS: readonly ReferenceClip[] = LOCAL_SAMPLES.flatMap(
  ({ slug, sample, studio }) =>
    studio === undefined
      ? []
      : [
          {
            slug,
            sample,
            start: seconds(studio.start),
            frames: framesAt(slug, studio.frameTimes),
            comparedTimes: studio.comparedTimes,
          },
        ],
);

export const STUDIO_CLIPS: readonly ReferenceClip[] = [
  STUDIO_SAILING,
  STUDIO_OFFICE,
  ...LOCAL_STUDIO_CLIPS,
];

/**
 * The recording's time of the export's frame.
 */
export function recordingTimeOf(clip: ReferenceClip, frame: ReferenceFrame): Seconds {
  return seconds(clip.start + frame.time);
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
  return { width: canvas.width, height: canvas.height, data: greyOf(image.data, canvas) };
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
 * The luma of RGBA pixels whose rows run from the top down, as a 2D canvas holds them.
 */
function greyOf(pixels: Uint8ClampedArray, size: GreySize): Uint8Array {
  return lumaOf(pixels, size, (row) => row);
}

/**
 * The luma of RGBA pixels read back from a WebGL canvas, whose rows run from the bottom up.
 */
export function greyOfDrawn(pixels: Uint8ClampedArray, size: GreySize): Uint8Array {
  return lumaOf(pixels, size, (row) => size.height - 1 - row);
}

interface GreySize {
  readonly width: number;
  readonly height: number;
}

function lumaOf(
  pixels: Uint8ClampedArray,
  size: GreySize,
  sourceRowOf: (row: number) => number,
): Uint8Array {
  const { width, height } = size;
  const grey = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const sourceRow = sourceRowOf(row);
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
