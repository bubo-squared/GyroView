import {
  binDisparitiesOf,
  buildStitchingSetup,
  clamp,
  degrees,
  degreesToRadians,
  disparityCandidatesOf,
  FIXED_SEAM,
  SEAM_BIN_COUNT,
  SEAM_CUT_DISPARITY,
  SEAM_MAX_BEND,
  seconds,
  type DecodedFrame,
  type Matrix3,
  type SeamAlignment,
  type SeamJoin,
  type StitchingSetup,
  type Vector3,
} from '@gyroview/core';
import { equirectangularPixelOf } from '@gyroview/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { readPixels } from './test/readPixels';
import { recordedFrame, type Scene } from './test/recordedFrames';
import { MULTI_TRACK, syntheticCalibration } from './test/syntheticStitching';
import { ThreeFrameRenderer } from './ThreeFrameRenderer';

const SIZE = { width: 256, height: 128 };
const RGBA = 4;
/**
 * How much farther from its own axis each lens sees the scene near the seam than an infinitely
 * far one: 2 degrees each, 4 between them, an object about 45 centimetres away.
 */
const PAINTED_DISPARITY = 4;
const UNIT_GAIN: Vector3 = [1, 1, 1];
const SILENT: Vector3 = [0, 0, 0];
const AZIMUTHS = Array.from({ length: 36 }, (_unused, index) => index * 10 + 5);
/**
 * Two 8-bit frames of one smooth scene, read through bilinear taps, differ by a level or so.
 */
const AGREEMENT_LEVELS = 1.5;
/**
 * Lens 1's share of the blend 88 degrees from lens 0's axis, about a fifth in the fixed join,
 * shows as a few levels over the disparity's 30-level difference between the lenses.
 */
const BLENDED_LEVELS = 3;
const DISPARITY_TOLERANCE = 0.1;
/**
 * The ring scene is nowhere darker than a tenth of the range; a gap between the lenses is black.
 */
const DARKEST = 20;

/**
 * A luma that varies 24 times around the ring and falls across it, so a slide across the ring
 * shows everywhere along it.
 */
const RING_CYCLES = 24;
const RING_AMPLITUDE = 0.2;
const TILT_PER_UNIT_Z = 1.9;

function ringScene([x, y, z]: Vector3): number {
  return clamp(
    0.5 + RING_AMPLITUDE * Math.sin(RING_CYCLES * Math.atan2(y, x)) + TILT_PER_UNIT_Z * z,
    0,
    1,
  );
}

/**
 * The body direction `theta` degrees from body +z at azimuth `azimuth` from +x towards +y.
 */
function directionAt(theta: number, azimuth: number): Vector3 {
  const t = degreesToRadians(degrees(theta));
  const a = degreesToRadians(degrees(azimuth));
  return [Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), Math.cos(t)];
}

/**
 * The scene as a lens sees it that sees everything `by` degrees farther from body +z than it
 * is: what it records in a direction is what lies `by` degrees nearer the axis.
 */
function displacedAcross(scene: Scene, by: number): Scene {
  return ([x, y, z]) => {
    const theta = Math.atan2(Math.hypot(x, y), z) - degreesToRadians(degrees(by));
    const azimuth = Math.atan2(y, x);
    return scene([
      Math.sin(theta) * Math.cos(azimuth),
      Math.sin(theta) * Math.sin(azimuth),
      Math.cos(theta),
    ]);
  };
}

function rotationOf(setup: StitchingSetup, lensIndex: number): Matrix3 {
  const lens = setup.lenses[lensIndex];
  if (!lens) throw new Error(`no lens ${lensIndex}`);
  return lens.rotation;
}

function meanDifference(a: readonly number[], b: readonly number[]): number {
  return a.reduce((total, level, index) => total + Math.abs(level - (b[index] ?? 0)), 0) / a.length;
}

function largestDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let largest = 0;
  for (const [index, level] of a.entries()) {
    largest = Math.max(largest, Math.abs(level - (b[index] ?? 0)));
  }
  return largest;
}

function alignment(join: SeamJoin, disparity: number): SeamAlignment {
  return {
    join,
    disparities: Array.from({ length: SEAM_BIN_COUNT }, () => degrees(disparity)),
  };
}

describe('the seam join', () => {
  const canvases: HTMLCanvasElement[] = [];
  const renderers: ThreeFrameRenderer[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  afterEach(() => {
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  /**
   * Both lenses recording the ring scene near the camera, each seeing it half the disparity
   * farther from its own axis, drawn as an equirectangular picture.
   */
  function openNearScene(): { renderer: ThreeFrameRenderer; canvas: HTMLCanvasElement } {
    const calibration = syntheticCalibration();
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK });
    const canvas = document.createElement('canvas');
    canvas.width = SIZE.width;
    canvas.height = SIZE.height;
    document.body.append(canvas);
    canvases.push(canvas);
    const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    renderers.push(renderer);
    renderer.setViewMode('equirectangular');
    const pair = calibration.lenses.map((lens, index) =>
      recordedFrame({
        lens,
        calibration,
        bodyToLens: rotationOf(setup, index),
        scene: displacedAcross(ringScene, ((index === 0 ? 1 : -1) * PAINTED_DISPARITY) / 2),
      }),
    );
    frames.push(...pair);
    renderer.present({ pair: { timestamp: seconds(0), frames: pair }, mediaTime: seconds(0) });
    return { renderer, canvas };
  }

  function levelTowards(canvas: HTMLCanvasElement, direction: Vector3): number {
    const pixels = readPixels(canvas);
    const { column, row } = equirectangularPixelOf(direction, SIZE);
    return pixels[((SIZE.height - 1 - row) * SIZE.width + column) * RGBA] ?? NaN;
  }

  /**
   * The levels towards each azimuth at `theta` degrees from lens 0's axis, drawn under the
   * gains.
   */
  function levelsAround(
    scene: { renderer: ThreeFrameRenderer; canvas: HTMLCanvasElement },
    theta: number,
    gains: readonly Vector3[],
  ): number[] {
    scene.renderer.setLensGains(gains);
    return AZIMUTHS.map((azimuth) => levelTowards(scene.canvas, directionAt(theta, azimuth)));
  }

  it('draws the fixed join as before any join was set', () => {
    const scene = openNearScene();
    const before = readPixels(scene.canvas);
    scene.renderer.setSeamAlignment(FIXED_SEAM);
    expect(readPixels(scene.canvas)).toEqual(before);
  });

  it('draws a bent join without disparity as the fixed join', () => {
    const scene = openNearScene();
    const fixed = readPixels(scene.canvas);
    scene.renderer.setSeamAlignment(alignment('bent', 0));
    expect(largestDifference(readPixels(scene.canvas), fixed)).toBeLessThanOrEqual(1);
  });

  it('bends each lens by half the disparity, so the two images of a near scene meet at the seam', () => {
    const scene = openNearScene();
    for (const join of ['fixed', 'bent'] as const) {
      scene.renderer.setSeamAlignment(alignment(join, PAINTED_DISPARITY));
      for (const theta of [88, 90, 92]) {
        const front = levelsAround(scene, theta, [UNIT_GAIN, SILENT]);
        const back = levelsAround(scene, theta, [SILENT, UNIT_GAIN]);
        const difference = meanDifference(front, back);
        const at = `${join} join, ${theta} degrees from lens 0's axis`;
        if (join === 'bent') expect(difference, at).toBeLessThan(AGREEMENT_LEVELS);
        else expect(difference, at).toBeGreaterThan(10 * AGREEMENT_LEVELS);
      }
    }
  });

  it('cuts where the disparity is large: one lens alone across most of the feather band', () => {
    const scene = openNearScene();
    const frontAlone = levelsAround(scene, 88, [UNIT_GAIN, SILENT]);
    const fixed = levelsAround(scene, 88, [UNIT_GAIN, UNIT_GAIN]);
    scene.renderer.setSeamAlignment(alignment('cut', PAINTED_DISPARITY));
    const cut = levelsAround(scene, 88, [UNIT_GAIN, UNIT_GAIN]);
    expect(meanDifference(fixed, frontAlone)).toBeGreaterThan(BLENDED_LEVELS);
    expect(meanDifference(cut, frontAlone)).toBeLessThan(AGREEMENT_LEVELS);
  });

  it('bends by no more than the overlap allows, and cuts what is left beyond', () => {
    const scene = openNearScene();
    scene.renderer.setSeamAlignment(alignment('bent', SEAM_MAX_BEND + SEAM_CUT_DISPARITY));
    const front = levelsAround(scene, 90, [UNIT_GAIN, SILENT]);
    const back = levelsAround(scene, 90, [SILENT, UNIT_GAIN]);
    expect(meanDifference(front, back)).toBeLessThan(AGREEMENT_LEVELS);
    const bent = levelsAround(scene, 88, [UNIT_GAIN, UNIT_GAIN]);
    expect(meanDifference(bent, levelsAround(scene, 88, [UNIT_GAIN, SILENT]))).toBeLessThan(
      AGREEMENT_LEVELS,
    );
  });

  it('leaves no gap between the lenses where it bends by the most and cuts the rest', () => {
    const scene = openNearScene();
    scene.renderer.setSeamAlignment(alignment('bent', SEAM_MAX_BEND + SEAM_CUT_DISPARITY));
    for (const theta of [89, 90, 91]) {
      const levels = levelsAround(scene, theta, [UNIT_GAIN, UNIT_GAIN]);
      expect(Math.min(...levels), `${theta} degrees from lens 0's axis`).toBeGreaterThan(DARKEST);
    }
  });

  it('lets the mismatch meter find the disparity in every bin, sliding lens 0 across the ring', async () => {
    const scene = openNearScene();
    const meter = scene.renderer.createSeamMismatchMeter();
    const measured = await meter.measure({
      lensIndex: 0,
      candidates: { kind: 'shifts', shifts: disparityCandidatesOf() },
      gains: [UNIT_GAIN, UNIT_GAIN],
    });
    if (!measured) throw new Error('the strip was not measured');
    for (const bin of binDisparitiesOf(measured)) {
      const at = `the bin at ${bin.azimuth} degrees`;
      expect(bin.isTrusted, at).toBe(true);
      expect(Math.abs(bin.disparity - PAINTED_DISPARITY), at).toBeLessThan(DISPARITY_TOLERANCE);
    }
  });
});
