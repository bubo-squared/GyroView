import {
  rotateVector,
  type CanvasWindow,
  type FramePair,
  type LensStitch,
  type Quaternion,
  type Vector3,
  type WindowCrop,
} from '@gyroview/core';
import { equirectangularPixelOf } from '@gyroview/core/testing';
import type { OpenedRecording } from '@gyroview/player/composition';

import { imageCircleOf, type PixelPoint } from './imageCircle';
import { calibrationOf, type CanvasSize } from './rendering';

const RGBA = 4;
const BLACK_THRESHOLD = 8;
const PROBES = 400;
/**
 * Probe pitches cycle through this many steps across 90 % of the half turn, so the probes cover
 * the sphere without piling up at the poles.
 */
const PITCH_STEPS = 17;
const PITCH_SPAN = 0.9;
/**
 * Steps are taken from the middle, so the pitches spread evenly above and below the horizon.
 */
const MIDDLE = 0.5;

/**
 * Fraction of pixels that received some picture; the stitched sphere has no holes.
 */
export function coverageOf(pixels: Uint8ClampedArray): number {
  let lit = 0;
  for (let offset = 0; offset < pixels.length; offset += RGBA) {
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    if (r + g + b > BLACK_THRESHOLD) lit += 1;
  }
  return lit / (pixels.length / RGBA);
}

/**
 * Byte offset of the pixel (rows from the bottom, as readPixels gives them) showing a direction.
 */
function pixelFor(direction: Vector3, size: CanvasSize): number {
  const pixel = equirectangularPixelOf(direction, size);
  return ((size.height - 1 - pixel.row) * size.width + pixel.column) * RGBA;
}

function probeDirection(probe: number): Vector3 {
  const yaw = (probe / PROBES) * 2 * Math.PI;
  const pitch = ((probe % PITCH_STEPS) / PITCH_STEPS - MIDDLE) * Math.PI * PITCH_SPAN;
  return [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/**
 * Two panoramas of one pair on a canvas of one size: unstabilized and under lock.
 */
export interface OffAndLock {
  readonly off: Uint8ClampedArray;
  readonly lock: Uint8ClampedArray;
  readonly size: CanvasSize;
}

/**
 * Mean colour difference between what the unstabilized render shows in a body direction and
 * what the lock render shows where that direction lands after the orientation. Small when the
 * lock render is the rigid rotation it should be.
 */
export function rigidRotationError(renders: OffAndLock, orientation: Quaternion): number {
  const { off, lock, size } = renders;
  let total = 0;
  for (let probe = 0; probe < PROBES; probe += 1) {
    const body = probeDirection(probe);
    const source = pixelFor(body, size);
    const target = pixelFor(rotateVector(orientation, body), size);
    for (let channel = 0; channel < RGBA - 1; channel += 1) {
      total += Math.abs((off[source + channel] ?? 0) - (lock[target + channel] ?? 0));
    }
  }
  return total / (PROBES * (RGBA - 1));
}

export interface CentreMeasurement {
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
function onFrame(point: PixelPoint, window: CanvasWindow, frameSize: CanvasSize): PixelPoint {
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
export function measureCentre(
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
