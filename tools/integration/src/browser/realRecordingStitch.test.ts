import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  buildStitchingSetup,
  DEFAULT_VIEW,
  equirectangularPixelOf,
  LensDecodePipeline,
  type FramePair,
  type StitchingSetup,
  type WindowCrop,
} from '@gyroview/core';
import { commands } from '@vitest/browser/context';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import {
  closeAll,
  openSample,
  PIPELINE_OPTIONS,
  port,
  skipUnlessDecodable,
  skipUnlessServed,
  takePairs,
} from './realRecordingSupport';
import { OFFICE_5K7_60, OFFICE_PROXY, SAILING_8K_30, type SampleRecording } from './sampleUrls';

const WIDTH = 1536;
const HEIGHT = 768;
const RENDER_TIME = 100;
const RGBA_CHANNELS = 4;
const BLACK_THRESHOLD = 8;
/**
 * The two 200-degree lenses cover the sphere; the few unlit pixels are the black beyond the
 * image circles' corners and dark scene content, not stitching holes.
 */
const MIN_COVERAGE = 0.97;
const FULL_TURN_DEGREES = 360;
const SEAM_BAND_DEGREES = 8;
const SEAM_ROWS_DEGREES = 50;
/**
 * The two lenses meet at yaw +-90: body left and right.
 */
const SEAM_COLUMNS = [
  equirectangularPixelOf([-1, 0, 0], { width: WIDTH, height: HEIGHT }).column,
  equirectangularPixelOf([1, 0, 0], { width: WIDTH, height: HEIGHT }).column,
];

/**
 * Fraction of pixels that received some picture; the stitched sphere has no holes.
 */
function coverageOf(pixels: Uint8ClampedArray): number {
  let lit = 0;
  for (let offset = 0; offset < pixels.length; offset += RGBA_CHANNELS) {
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    if (r + g + b > BLACK_THRESHOLD) lit += 1;
  }
  return lit / (pixels.length / RGBA_CHANNELS);
}

/**
 * Mean absolute difference between what lens 0 and lens 1 see in the overlap band around the
 * yaw +-90 seams, over rows away from the poles. Lower means the two projections agree.
 */
function seamDifference(lens0: Uint8ClampedArray, lens1: Uint8ClampedArray): number {
  const columnsPerDegree = WIDTH / FULL_TURN_DEGREES;
  const rowsPerDegree = HEIGHT / (FULL_TURN_DEGREES / 2);
  const bandColumns = Math.round(SEAM_BAND_DEGREES * columnsPerDegree);
  const rowSpan = Math.round(SEAM_ROWS_DEGREES * rowsPerDegree);
  const sum = { total: 0, count: 0 };
  for (let row = HEIGHT / 2 - rowSpan; row < HEIGHT / 2 + rowSpan; row += 1) {
    for (const seamColumn of SEAM_COLUMNS) {
      for (let column = seamColumn - bandColumns; column < seamColumn + bandColumns; column += 1) {
        accumulateDifference(sum, { lens0, lens1 }, (row * WIDTH + column) * RGBA_CHANNELS);
      }
    }
  }
  return sum.total / sum.count;
}

interface LensPixels {
  readonly lens0: Uint8ClampedArray;
  readonly lens1: Uint8ClampedArray;
}

function accumulateDifference(
  sum: { total: number; count: number },
  pixels: LensPixels,
  offset: number,
): void {
  for (let channel = 0; channel < RGBA_CHANNELS - 1; channel += 1) {
    const difference =
      (pixels.lens0[offset + channel] ?? 0) - (pixels.lens1[offset + channel] ?? 0);
    sum.total += Math.abs(difference);
    sum.count += 1;
  }
}

interface CircleExtent {
  readonly width: number;
  readonly height: number;
  readonly firstLitColumn: number;
  readonly lastLitColumn: number;
  readonly firstLitRow: number;
  readonly lastLitRow: number;
}

const LIT_THRESHOLD = 24;

function isLit(data: Uint8ClampedArray, index: number): boolean {
  const offset = index * RGBA_CHANNELS;
  return (data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0) > LIT_THRESHOLD;
}

/**
 * Where the fisheye image circle ends in a decoded frame, along the row and column through its
 * centre: a black margin on a side means the encoder kept the whole canvas square there, a
 * circle touching the edge means it was cut by the sensor window.
 */
function imageCircleExtent(frame: VideoFrame): CircleExtent {
  const width = frame.displayWidth;
  const height = frame.displayHeight;
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(frame, 0, 0);
  const row = context.getImageData(0, Math.floor(height / 2), width, 1).data;
  const column = context.getImageData(Math.floor(width / 2), 0, 1, height).data;
  const litColumns = Array.from({ length: width }, (_unused, index) => index).filter((index) =>
    isLit(row, index),
  );
  const litRows = Array.from({ length: height }, (_unused, index) => index).filter((index) =>
    isLit(column, index),
  );
  return {
    width,
    height,
    firstLitColumn: litColumns[0] ?? -1,
    lastLitColumn: litColumns.at(-1) ?? -1,
    firstLitRow: litRows[0] ?? -1,
    lastLitRow: litRows.at(-1) ?? -1,
  };
}

function jsonDataUrl(value: unknown): string {
  return `data:application/json;base64,${btoa(JSON.stringify(value, undefined, 2))}`;
}

function renderLensesApart(
  canvas: HTMLCanvasElement,
  setup: StitchingSetup,
  pair: FramePair<VideoFrame>,
): { readonly lens0: Uint8ClampedArray; readonly lens1: Uint8ClampedArray } {
  const renderer = ThreeFrameRenderer.create(canvas, setup, {
    preserveDrawingBuffer: true,
    view: { ...DEFAULT_VIEW, projection: 'equirectangular' },
  });
  try {
    renderer.present({ pair, mediaTime: pair.timestamp, frameIndex: undefined });
    renderer.setLensGain(1, [0, 0, 0]);
    const lens0 = renderer.readPixels();
    renderer.setLensGain(1, [1, 1, 1]);
    renderer.setLensGain(0, [0, 0, 0]);
    const lens1 = renderer.readPixels();
    return { lens0, lens1 };
  } finally {
    renderer.dispose();
  }
}

interface StitchedFrame {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: ThreeFrameRenderer;
  readonly pair: FramePair<VideoFrame>;
  readonly setup: (windowCrop: WindowCrop | undefined) => StitchingSetup;
}

async function stitchOneFrame(
  context: TestContext,
  sample: SampleRecording,
  cleanups: (() => void)[],
): Promise<StitchedFrame> {
  await skipUnlessServed(context, sample);
  const opened = await openSample(sample);
  cleanups.push(opened.dispose);
  await skipUnlessDecodable(context, opened.lensTracks);
  const calibration = opened.recording.calibration.calibration;
  if (!calibration) throw new Error(`${sample.name} carries no calibration`);
  const pipeline = new LensDecodePipeline<VideoFrame>(opened.lensTracks, port, PIPELINE_OPTIONS);
  const pairs = await takePairs(pipeline, RENDER_TIME, 1);
  cleanups.push(() => {
    closeAll(pairs);
  });
  const [pair] = pairs;
  if (!pair) throw new Error('no pair decoded');
  const setup = (windowCrop: WindowCrop | undefined): StitchingSetup =>
    buildStitchingSetup({ calibration, layout: opened.layout, windowCrop });
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  document.body.append(canvas);
  cleanups.push(() => {
    canvas.remove();
  });
  const renderer = ThreeFrameRenderer.create(canvas, setup(opened.recording.info.windowCrop), {
    preserveDrawingBuffer: true,
    view: { ...DEFAULT_VIEW, projection: 'equirectangular' },
  });
  cleanups.push(() => {
    renderer.dispose();
  });
  renderer.present({ pair, mediaTime: pair.timestamp, frameIndex: undefined });
  return { canvas, renderer, pair, setup };
}

describe('stitching one frame of the real recordings', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const [slug, sample] of [
    ['office', OFFICE_5K7_60],
    ['office-proxy', OFFICE_PROXY],
    ['sailing', SAILING_8K_30],
  ] as const) {
    it(`renders an equirectangular frame of the ${sample.name} without holes and saves it for inspection`, async (context) => {
      const { canvas, renderer } = await stitchOneFrame(context, sample, cleanups);
      const blended = await commands.saveArtifact(
        `${slug}-${RENDER_TIME}s-equirect.png`,
        canvas.toDataURL('image/png'),
      );
      expect(blended).toContain('.artifacts');
      expect(coverageOf(renderer.readPixels())).toBeGreaterThan(MIN_COVERAGE);
      renderer.setLensGain(1, [0, 0, 0]);
      await commands.saveArtifact(
        `${slug}-${RENDER_TIME}s-lens0.png`,
        canvas.toDataURL('image/png'),
      );
      renderer.setLensGain(1, [1, 1, 1]);
      renderer.setLensGain(0, [0, 0, 0]);
      await commands.saveArtifact(
        `${slug}-${RENDER_TIME}s-lens1.png`,
        canvas.toDataURL('image/png'),
      );
    });

    it(`records where the image circle of each ${sample.name} frame meets the frame edges`, async (context) => {
      const { pair } = await stitchOneFrame(context, sample, cleanups);
      const extents = pair.frames.map((frame) => imageCircleExtent(frame.handle));
      const saved = await commands.saveArtifact(
        `${slug}-${RENDER_TIME}s-image-circle.json`,
        jsonDataUrl(extents),
      );
      expect(saved).toContain('.artifacts');
    });

    it(`measures how well the two lenses of the ${sample.name} agree at the seams with and without the sensor crop window`, async (context) => {
      const { pair, setup } = await stitchOneFrame(context, sample, cleanups);
      const crop = {
        sensorWidth: 5376,
        sensorHeight: 5376,
        cropWidth: 5312,
        cropHeight: 5312,
        cropOffsetX: 0,
        cropOffsetY: 0,
      };
      const differences = new Map<string, number>();
      for (const [name, windowCrop] of [
        ['sensor crop window', crop],
        ['whole canvas square', undefined],
      ] as const) {
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const apart = renderLensesApart(canvas, setup(windowCrop), pair);
        differences.set(name, seamDifference(apart.lens0, apart.lens1));
      }
      const saved = await commands.saveArtifact(
        `${slug}-${RENDER_TIME}s-seam-differences.json`,
        jsonDataUrl(Object.fromEntries(differences)),
      );
      expect(saved).toContain('.artifacts');
      expect(differences.size).toBe(2);
    });
  }
});
