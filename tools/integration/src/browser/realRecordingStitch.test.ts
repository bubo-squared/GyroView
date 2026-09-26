import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  buildStitchingSetup,
  DecodePipeline,
  type CalibrationSet,
  type FramePair,
  type LensStitch,
  type StitchingSetup,
  type WindowCrop,
} from '@gyroview/core';
import { commands } from '@vitest/browser/context';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { imageCircleOf, type PixelPoint } from './imageCircle';
import {
  closeAll,
  openSample,
  PIPELINE_OPTIONS,
  port,
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
/**
 * How far, as a fraction of the lens frame's width, the image circle's centre may lie from
 * where the calibration's principal point lands on the frame. Lens decentring and the halo
 * along the rim account for up to about 0.75 % on the sailing frames.
 */
const MAX_CENTRE_OFFSET_FRACTION = 0.01;

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

function jsonDataUrl(value: unknown): string {
  return `data:application/json;base64,${btoa(JSON.stringify(value, undefined, 2))}`;
}

interface StitchedFrame {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: ThreeFrameRenderer;
  readonly pair: FramePair<VideoFrame>;
  readonly setup: StitchingSetup;
  readonly calibration: CalibrationSet;
  readonly windowCrop: WindowCrop | undefined;
}

async function stitchOneFrame(
  context: TestContext,
  sample: SampleRecording,
  cleanups: (() => void)[],
): Promise<StitchedFrame> {
  await skipUnlessServed(context, sample);
  const opened = await openSample(context, sample);
  cleanups.push(() => {
    opened.dispose();
  });
  const calibration = opened.recording.calibration.calibration;
  if (!calibration) throw new Error(`${sample.name} carries no calibration`);
  const pipeline = new DecodePipeline<VideoFrame>(opened.frameSources, port, PIPELINE_OPTIONS);
  const pairs = await takePairs(pipeline, RENDER_TIME, 1);
  cleanups.push(() => {
    closeAll(pairs);
  });
  const [pair] = pairs;
  if (!pair) throw new Error('no pair decoded');
  const setup = buildStitchingSetup({ calibration, layout: opened.layout });
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  document.body.append(canvas);
  cleanups.push(() => {
    canvas.remove();
  });
  const renderer = ThreeFrameRenderer.create(canvas, setup, {
    preserveDrawingBuffer: true,
    viewMode: 'equirectangular',
  });
  cleanups.push(() => {
    renderer.dispose();
  });
  renderer.present({ pair, mediaTime: pair.timestamp, frameIndex: undefined });
  return {
    canvas,
    renderer,
    pair,
    setup,
    calibration,
    windowCrop: opened.recording.info.windowCrop,
  };
}

interface CentreMeasurement {
  readonly lensIndex: number;
  readonly frameWidth: number;
  readonly circle: {
    readonly centre: PixelPoint;
    readonly radius: number;
    readonly rmsResidual: number;
  };
  readonly onWholeSquare: PixelPoint;
  readonly onSensorWindow: PixelPoint | undefined;
  readonly distanceToWholeSquare: number;
  readonly distanceToSensorWindow: number | undefined;
}

/**
 * Where the calibration's principal point lands on the lens frame if the frame shows the given
 * part of the canvas square: `origin` and `span` in canvas pixels.
 */
function principalPointOnFrame(
  lens: LensStitch,
  stitched: StitchedFrame,
  window: { readonly origin: PixelPoint; readonly span: PixelPoint },
): PixelPoint {
  const calibrated = stitched.calibration.lenses.find((c) => c.lensIndex === lens.lensIndex);
  if (!calibrated) throw new Error(`no calibration for lens ${lens.lensIndex}`);
  const side = stitched.calibration.canvas.height;
  const frame = stitched.pair.frames[lens.frameIndex]?.handle;
  if (!frame) throw new Error(`no frame ${lens.frameIndex}`);
  const width = lens.region.width * frame.displayWidth;
  const height = lens.region.height * frame.displayHeight;
  const localX =
    calibrated.model.principalPoint.x - Math.floor(calibrated.model.principalPoint.x / side) * side;
  return {
    x: ((localX - window.origin.x) / window.span.x) * width,
    y: ((calibrated.model.principalPoint.y - window.origin.y) / window.span.y) * height,
  };
}

function sensorWindowOf(
  crop: WindowCrop | undefined,
): { origin: PixelPoint; span: PixelPoint } | undefined {
  return crop?.cropWidth === undefined || crop.cropHeight === undefined
    ? undefined
    : {
        origin: { x: crop.cropOffsetX ?? 0, y: crop.cropOffsetY ?? 0 },
        span: { x: crop.cropWidth, y: crop.cropHeight },
      };
}

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The image circle of one lens frame against the two readings of the canvas window: the whole
 * square (what the core uses) and the info record's sensor window at its offset (what ADR 0008
 * assumed).
 */
function measureCentre(lens: LensStitch, stitched: StitchedFrame): CentreMeasurement {
  const frame = stitched.pair.frames[lens.frameIndex]?.handle;
  if (!frame) throw new Error(`no frame ${lens.frameIndex}`);
  const side = stitched.calibration.canvas.height;
  const circle = imageCircleOf(frame, lens.region);
  const onWholeSquare = principalPointOnFrame(lens, stitched, {
    origin: { x: 0, y: 0 },
    span: { x: side, y: side },
  });
  const sensorWindow = sensorWindowOf(stitched.windowCrop);
  const onSensorWindow = sensorWindow && principalPointOnFrame(lens, stitched, sensorWindow);
  return {
    lensIndex: lens.lensIndex,
    frameWidth: lens.region.width * frame.displayWidth,
    circle: { centre: circle.centre, radius: circle.radius, rmsResidual: circle.rmsResidual },
    onWholeSquare,
    onSensorWindow,
    distanceToWholeSquare: distance(circle.centre, onWholeSquare),
    distanceToSensorWindow: onSensorWindow && distance(circle.centre, onSensorWindow),
  };
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

    it(`finds the image circle of each ${sample.name} frame centred on the whole canvas square, not on the sensor window (ADR 0014)`, async (context) => {
      const stitched = await stitchOneFrame(context, sample, cleanups);
      const measurements = stitched.setup.lenses.map((lens) => measureCentre(lens, stitched));
      const saved = await commands.saveArtifact(
        `${slug}-${RENDER_TIME}s-image-circle.json`,
        jsonDataUrl(measurements),
      );
      expect(saved).toContain('.artifacts');
      for (const measured of measurements) {
        expect(measured.distanceToWholeSquare).toBeLessThan(
          MAX_CENTRE_OFFSET_FRACTION * measured.frameWidth,
        );
        if (measured.distanceToSensorWindow !== undefined) {
          expect(measured.distanceToWholeSquare).toBeLessThan(measured.distanceToSensorWindow);
        }
      }
    });
  }
});
