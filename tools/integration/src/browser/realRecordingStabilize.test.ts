import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  buildStitchingSetup,
  conjugateQuaternion,
  DEFAULT_VIEW,
  equirectangularPixelOf,
  imuFrameFor,
  LensDecodePipeline,
  microseconds,
  OrientationTrack,
  rotateVector,
  StabilizingFrameSink,
  stabilizerFor,
  toBodyFrame,
  type CaptureClock,
  type Quaternion,
  type StabilizationMode,
} from '@gyroview/core';
import { commands } from '@vitest/browser/context';
import { afterEach, describe, expect, it } from 'vitest';

import {
  closeAll,
  openSample,
  PIPELINE_OPTIONS,
  port,
  skipUnlessDecodable,
  skipUnlessServed,
  takePairs,
} from './realRecordingSupport';
import { OFFICE_5K7_60, SAILING_8K_30 } from './sampleUrls';

const WIDTH = 1536;
const HEIGHT = 768;
const RENDER_TIMES = [60, 100];
const MODES: readonly StabilizationMode[] = ['off', 'lock', 'horizon'];
const RGBA = 4;
const PROBES = 400;
/**
 * Mean colour difference (0-255) tolerated between the unstabilized render and the lock render
 * resampled through the orientation: bilinear sampling noise, not a rotation error.
 */
const MAX_RIGID_ROTATION_ERROR = 20;
/**
 * The estimated down direction may differ from the accelerometer by this much (degrees): the
 * filter follows gravity with a time constant of seconds while the boat accelerates.
 */
const MAX_DOWN_ERROR_DEGREES = 12;

const SIZE = { width: WIDTH, height: HEIGHT };

/**
 * Byte offset of the pixel (rows from the bottom, as readPixels gives them) showing a direction.
 */
function pixelFor(direction: readonly [number, number, number]): number {
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
    const body: [number, number, number] = [
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

function angleBetweenDegrees(a: readonly number[], b: readonly number[]): number {
  const dot = (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
  const lengths = Math.hypot(...a) * Math.hypot(...b);
  return (Math.acos(Math.max(-1, Math.min(1, dot / lengths))) * 180) / Math.PI;
}

function nearestGyroSample(
  captureTimes: ArrayLike<number>,
  clock: CaptureClock,
  videoTime: number,
): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < captureTimes.length; index += 100) {
    const captureTime = microseconds(captureTimes[index] ?? 0);
    const distance = Math.abs(clock.gyroVideoTimeOf(captureTime) - videoTime);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = index;
  }
  return best;
}

describe('stabilizing the real recordings', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const [slug, sample] of [
    ['office', OFFICE_5K7_60],
    ['sailing', SAILING_8K_30],
  ] as const) {
    it(`renders the ${sample.name} in every mode for inspection, checks lock is a rigid rotation of off and that the estimate follows gravity`, async (context) => {
      await skipUnlessServed(context, sample);
      const opened = await openSample(sample);
      cleanups.push(opened.dispose);
      await skipUnlessDecodable(context, opened.lensTracks);
      const { recording } = opened;
      const calibration = recording.calibration.calibration;
      const gyro = await recording.readGyroRecord();
      if (!calibration || !gyro) throw new Error(`${sample.name} lacks calibration or gyro`);
      const clock = await recording.captureClock();
      const frame = imuFrameFor(recording.info);
      expect(frame.isVerified).toBe(true);
      const orientations = OrientationTrack.integrate({ gyro: gyro.track, clock, frame });

      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      document.body.append(canvas);
      cleanups.push(() => {
        canvas.remove();
      });
      const setup = buildStitchingSetup({
        calibration,
        layout: opened.layout,
        windowCrop: recording.info.windowCrop,
      });
      const renderer = ThreeFrameRenderer.create(canvas, setup, {
        preserveDrawingBuffer: true,
        view: { ...DEFAULT_VIEW, projection: 'equirectangular' },
      });
      cleanups.push(() => {
        renderer.dispose();
      });
      const sink = new StabilizingFrameSink({
        sink: renderer,
        orientations,
        frameTimes: undefined,
      });

      for (const time of RENDER_TIMES) {
        const pipeline = new LensDecodePipeline<VideoFrame>(
          opened.lensTracks,
          port,
          PIPELINE_OPTIONS,
        );
        const pairs = await takePairs(pipeline, time, 1);
        const [pair] = pairs;
        if (!pair) throw new Error('no pair decoded');
        const rendered: Partial<Record<StabilizationMode, Uint8ClampedArray>> = {};
        for (const mode of MODES) {
          sink.setStabilizer(stabilizerFor(mode));
          sink.present({ pair, mediaTime: pair.timestamp, frameIndex: undefined });
          rendered[mode] = renderer.readPixels();
          await commands.saveArtifact(
            `${slug}-${time}s-${mode}.png`,
            canvas.toDataURL('image/png'),
          );
        }
        const orientation = orientations.orientationAt(pair.timestamp);
        if (rendered.off && rendered.lock) {
          expect(rigidRotationError(rendered.off, rendered.lock, orientation)).toBeLessThan(
            MAX_RIGID_ROTATION_ERROR,
          );
        }
        const sampleIndex = nearestGyroSample(gyro.track.captureTimes, clock, pair.timestamp);
        const measuredUp = toBodyFrame(frame, gyro.track.sampleAt(sampleIndex).acceleration);
        const estimatedUp = rotateVector(conjugateQuaternion(orientation), [0, -1, 0]);
        expect(angleBetweenDegrees(measuredUp, estimatedUp)).toBeLessThan(MAX_DOWN_ERROR_DEGREES);
        closeAll(pairs);
      }
    });
  }
});
