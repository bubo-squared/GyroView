import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  buildStitchingSetup,
  IDENTITY_MATRIX3,
  rotateVector,
  StabilizingFrameSink,
  stabilizerFor,
  type CalibrationSet,
  type CanvasWindow,
  type FramePair,
  type LensStitch,
  type MotionSetup,
  type Quaternion,
  type StabilizationMode,
  type Vector3,
  type WindowCrop,
} from '@gyroview/core';
import { equirectangularPixelOf } from '@gyroview/core/testing';
import { commands } from '@vitest/browser/context';
import type { OpenedRecording } from '@gyroview/player/composition';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { imageCircleOf, type PixelPoint } from './imageCircle';
import { SharedSample } from './SharedSample';
import { OFFICE_5K7_60, OFFICE_PROXY, SAILING_8K_30 } from './sampleUrls';
import { worldMovement } from './worldMovement';

const WIDTH = 1536;
const HEIGHT = 768;
const SIZE = { width: WIDTH, height: HEIGHT };
/**
 * The moment every test renders, in seconds: well into both recordings, the camera moving.
 */
const MOMENT = 100;
const RGBA = 4;
const BLACK_THRESHOLD = 8;
/**
 * The two 200-degree lenses cover the sphere; the few unlit pixels are the black beyond the
 * image circles' corners and dark scene content, not stitching holes.
 */
const MIN_COVERAGE = 0.97;
const UNITY_GAIN: Vector3 = [1, 1, 1];
const SILENCED: Vector3 = [0, 0, 0];
/**
 * How far, as a fraction of the lens frame's width, the image circle's centre may lie from
 * where the calibration's principal point lands on the frame. Lens decentring and the halo
 * along the rim account for up to about 0.75 % on the sailing frames.
 */
const MAX_CENTRE_OFFSET_FRACTION = 0.01;
const MODES: readonly StabilizationMode[] = ['off', 'lock', 'horizon'];
const PROBES = 400;
/**
 * Mean colour difference (0-255) tolerated between the unstabilized render and the lock render
 * resampled through the orientation: bilinear sampling noise, not a rotation error.
 */
const MAX_RIGID_ROTATION_ERROR = 20;
/**
 * A moment of the sailing recording where the boat rolls: lock halves how much the world moves
 * between pairs half a second apart (16.6 against 33.7 unstabilized, in colour difference).
 */
const STILLNESS_MOMENT = 135;
/**
 * The most the world may move under lock, as a fraction of its movement unstabilized. A wrong
 * IMU frame or rotation convention moves it about as much as leaving the picture alone (ADR 0009).
 */
const MAX_LOCKED_MOVEMENT = 0.75;

/**
 * Fraction of pixels that received some picture; the stitched sphere has no holes.
 */
function coverageOf(pixels: Uint8ClampedArray): number {
  let lit = 0;
  for (let offset = 0; offset < pixels.length; offset += RGBA) {
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    if (r + g + b > BLACK_THRESHOLD) lit += 1;
  }
  return lit / (pixels.length / RGBA);
}

function jsonDataUrl(value: unknown): string {
  return `data:application/json;base64,${btoa(JSON.stringify(value, undefined, 2))}`;
}

function calibrationOf(opened: OpenedRecording): CalibrationSet {
  const { calibration } = opened.recording.calibration;
  if (!calibration) throw new Error('the recording carries no calibration');
  return calibration;
}

function motionOf(opened: OpenedRecording): MotionSetup {
  if (!opened.motion) throw new Error('the recording carries no gyro record');
  return opened.motion;
}

/**
 * Byte offset of the pixel (rows from the bottom, as readPixels gives them) showing a direction.
 */
function pixelFor(direction: Vector3): number {
  const pixel = equirectangularPixelOf(direction, SIZE);
  return ((HEIGHT - 1 - pixel.row) * WIDTH + pixel.column) * RGBA;
}

/**
 * Mean colour difference between what the unstabilized render shows in a body direction and
 * what the lock render shows where that direction lands after the orientation. Small when the
 * lock render is the rigid rotation it should be.
 */
function rigidRotationError(
  off: Uint8ClampedArray,
  lock: Uint8ClampedArray,
  orientation: Quaternion,
): number {
  let total = 0;
  for (let probe = 0; probe < PROBES; probe += 1) {
    const yaw = (probe / PROBES) * 2 * Math.PI;
    const pitch = ((probe % 17) / 17 - 0.5) * Math.PI * 0.9;
    const body: Vector3 = [
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ];
    const source = pixelFor(body);
    const target = pixelFor(rotateVector(orientation, body));
    for (let channel = 0; channel < RGBA - 1; channel += 1) {
      total += Math.abs((off[source + channel] ?? 0) - (lock[target + channel] ?? 0));
    }
  }
  return total / (PROBES * (RGBA - 1));
}

interface FrameSize {
  readonly width: number;
  readonly height: number;
}

interface CentreMeasurement {
  readonly lensIndex: number;
  readonly frameWidth: number;
  readonly circle: {
    readonly centre: PixelPoint;
    readonly radius: number;
    readonly rmsResidual: number;
  };
  readonly onCanvasWindow: PixelPoint;
  readonly onSensorWindow: PixelPoint | undefined;
  readonly distanceToCanvasWindow: number;
  readonly distanceToSensorWindow: number | undefined;
}

/**
 * Where a point of the canvas lands on a lens frame of `frameSize` that shows `window` of it.
 */
function onFrame(point: PixelPoint, window: CanvasWindow, frameSize: FrameSize): PixelPoint {
  return {
    x: ((point.x - window.x) / window.width) * frameSize.width,
    y: ((point.y - window.y) / window.height) * frameSize.height,
  };
}

/**
 * The info record's sensor window within the lens's canvas square, as ADR 0008 read it.
 */
function sensorWindowOf(lens: LensStitch, crop: WindowCrop | undefined): CanvasWindow | undefined {
  return crop?.cropWidth === undefined || crop.cropHeight === undefined
    ? undefined
    : {
        x: lens.window.x + (crop.cropOffsetX ?? 0),
        y: lens.window.y + (crop.cropOffsetY ?? 0),
        width: crop.cropWidth,
        height: crop.cropHeight,
      };
}

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The image circle of one lens frame against the two readings of the canvas window: the core's
 * (the whole square) and the info record's sensor window, which ADR 0008 assumed.
 */
function measureCentre(
  opened: OpenedRecording,
  lens: LensStitch,
  pair: FramePair<VideoFrame>,
): CentreMeasurement {
  const frame = pair.frames[lens.frameSlot]?.handle;
  if (!frame) throw new Error(`no frame ${lens.frameSlot}`);
  const calibrated = calibrationOf(opened).lenses.find((c) => c.lensIndex === lens.lensIndex);
  if (!calibrated) throw new Error(`no calibration for lens ${lens.lensIndex}`);
  const { principalPoint } = calibrated.model;
  const frameSize = {
    width: lens.region.width * frame.displayWidth,
    height: lens.region.height * frame.displayHeight,
  };
  const circle = imageCircleOf(frame, lens.region);
  const onCanvasWindow = onFrame(principalPoint, lens.window, frameSize);
  const sensorWindow = sensorWindowOf(lens, opened.recording.info.windowCrop);
  const onSensorWindow = sensorWindow && onFrame(principalPoint, sensorWindow, frameSize);
  return {
    lensIndex: lens.lensIndex,
    frameWidth: frameSize.width,
    circle: { centre: circle.centre, radius: circle.radius, rmsResidual: circle.rmsResidual },
    onCanvasWindow,
    onSensorWindow,
    distanceToCanvasWindow: distance(circle.centre, onCanvasWindow),
    distanceToSensorWindow: onSensorWindow && distance(circle.centre, onSensorWindow),
  };
}

describe('rendering the real recordings', () => {
  const office = new SharedSample(OFFICE_5K7_60);
  const proxy = new SharedSample(OFFICE_PROXY);
  const sailing = new SharedSample(SAILING_8K_30);
  const cleanups: (() => void)[] = [];

  /**
   * An equirectangular renderer for the sample on a canvas of `SIZE`, removed after the test.
   */
  function equirectangularRenderer(opened: OpenedRecording): {
    canvas: HTMLCanvasElement;
    renderer: ThreeFrameRenderer;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    document.body.append(canvas);
    const setup = buildStitchingSetup({
      calibration: calibrationOf(opened),
      layout: opened.layout,
    });
    const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    renderer.setViewMode('equirectangular');
    cleanups.push(() => {
      renderer.dispose();
      canvas.remove();
    });
    return { canvas, renderer };
  }

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  afterAll(() => {
    for (const shared of [office, proxy, sailing]) shared.dispose();
  });

  for (const [slug, shared] of [
    ['office', office],
    ['office-proxy', proxy],
    ['sailing', sailing],
  ] as const) {
    const { name } = shared.sample;

    it(`stitches a frame of the ${name} into an equirectangular picture without holes`, async (context) => {
      const opened = await shared.open(context);
      const { first } = await shared.momentAt(context, MOMENT);
      const { canvas, renderer } = equirectangularRenderer(opened);
      renderer.present({ pair: first, mediaTime: first.timestamp });
      await commands.saveArtifact(`${slug}-${MOMENT}s-equirect.png`, canvas.toDataURL('image/png'));
      expect(coverageOf(renderer.readPixels())).toBeGreaterThan(MIN_COVERAGE);
      renderer.setLensGains([UNITY_GAIN, SILENCED]);
      await commands.saveArtifact(`${slug}-${MOMENT}s-lens0.png`, canvas.toDataURL('image/png'));
      renderer.setLensGains([SILENCED, UNITY_GAIN]);
      await commands.saveArtifact(`${slug}-${MOMENT}s-lens1.png`, canvas.toDataURL('image/png'));
    });

    it(`finds the image circle of each ${name} frame where the core's canvas window puts the principal point, not the sensor window (ADR 0014)`, async (context) => {
      const opened = await shared.open(context);
      const { first } = await shared.momentAt(context, MOMENT);
      const setup = buildStitchingSetup({
        calibration: calibrationOf(opened),
        layout: opened.layout,
      });
      const measurements = setup.lenses.map((lens) => measureCentre(opened, lens, first));
      await commands.saveArtifact(
        `${slug}-${MOMENT}s-image-circle.json`,
        jsonDataUrl(measurements),
      );
      for (const measured of measurements) {
        expect(measured.distanceToCanvasWindow).toBeLessThan(
          MAX_CENTRE_OFFSET_FRACTION * measured.frameWidth,
        );
        if (measured.distanceToSensorWindow !== undefined) {
          expect(measured.distanceToCanvasWindow).toBeLessThan(measured.distanceToSensorWindow);
        }
      }
    });
  }

  for (const [slug, shared] of [
    ['office', office],
    ['sailing', sailing],
  ] as const) {
    it(`turns the ${shared.sample.name} under lock by exactly the orientation the player integrated`, async (context) => {
      const opened = await shared.open(context);
      const { first } = await shared.momentAt(context, MOMENT);
      const { orientations, imuFrame } = motionOf(opened);
      expect(imuFrame.isVerified).toBe(true);
      const { canvas, renderer } = equirectangularRenderer(opened);
      const sink = new StabilizingFrameSink({
        sink: renderer,
        orientations,
        frameTimes: undefined,
      });
      const rendered = new Map<StabilizationMode, Uint8ClampedArray>();
      for (const mode of MODES) {
        sink.setStabilizer(stabilizerFor(mode));
        sink.present({ pair: first, mediaTime: first.timestamp });
        rendered.set(mode, renderer.readPixels());
        await commands.saveArtifact(
          `${slug}-${MOMENT}s-${mode}.png`,
          canvas.toDataURL('image/png'),
        );
      }
      const off = rendered.get('off') ?? new Uint8ClampedArray();
      const lock = rendered.get('lock') ?? new Uint8ClampedArray();
      const orientation = orientations.orientationAt(first.timestamp);
      expect(rigidRotationError(off, lock, orientation)).toBeLessThan(MAX_RIGID_ROTATION_ERROR);
    });
  }

  it('keeps the world of the sailing recording stiller under lock than unstabilized', async (context) => {
    const opened = await sailing.open(context);
    const { first, later } = await sailing.momentAt(context, STILLNESS_MOMENT);
    const { orientations } = motionOf(opened);
    const { renderer } = equirectangularRenderer(opened);
    const renderable = { renderer, first, later };
    const lock = stabilizerFor('lock');
    const unstabilized = worldMovement(renderable, () => IDENTITY_MATRIX3);
    const locked = worldMovement(renderable, (pair) =>
      lock.nextRotation(orientations.orientationAt(pair.timestamp), pair.timestamp),
    );
    expect(locked).toBeLessThan(unstabilized * MAX_LOCKED_MOVEMENT);
  });
});
