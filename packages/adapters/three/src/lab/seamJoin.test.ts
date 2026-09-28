import {
  binDisparitiesOf,
  buildStitchingSetup,
  degrees,
  disparityCandidatesOf,
  FIXED_SEAM_ALIGNMENT,
  SEAM_BIN_COUNT,
  SEAM_CUT_DISPARITY,
  SEAM_MAX_BEND,
  seamBinAzimuth,
  seconds,
  type DecodedFrame,
  type SeamAlignment,
  type SeamJoin,
  type Vector3,
} from '@gyroview/core';
import { equirectangularPixelOf } from '@gyroview/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { LabRenderer } from './LabRenderer';
import { directionAt, nearScenePair, type DisparityProfile } from '../test/nearScene';
import { readPixels } from '../test/readPixels';
import { MULTI_TRACK, syntheticCalibration } from '../test/syntheticStitching';

const SIZE = { width: 256, height: 128 };
const RGBA = 4;
/**
 * How far apart the two lenses' images of a near scene lie at the seam: 4 degrees is an object
 * about 45 centimetres away, what a bent join bends by at most.
 */
const NEAR = 4;
const UNIT_GAIN: Vector3 = [1, 1, 1];
const SILENT: Vector3 = [0, 0, 0];
const FRONT_ALONE: readonly Vector3[] = [UNIT_GAIN, SILENT];
const BACK_ALONE: readonly Vector3[] = [SILENT, UNIT_GAIN];
const BOTH: readonly Vector3[] = [UNIT_GAIN, UNIT_GAIN];
const AZIMUTHS = Array.from({ length: 36 }, (_unused, index) => index * 10 + 5);
/**
 * The first and last bins' outer halves and the wrap between them, and a quarter turn apart.
 */
const EDGE_AZIMUTHS = [0, 1, 2.5, 90, 180, 270, 357.5, 359];
/**
 * Two 8-bit frames of one smooth scene, read through bilinear taps, differ by a level or so.
 */
const AGREEMENT_LEVELS = 1.5;
const DISPARITY_TOLERANCE = 0.1;
/**
 * The ring scene is nowhere darker than a tenth of the range; a gap between the lenses is black.
 */
const DARKEST = 20;

function constant(disparity: number): DisparityProfile {
  return () => disparity;
}

/**
 * From 0 at the left seam to 4 degrees at the right one, the first and the last bins alike.
 */
function aroundTheRing(azimuth: number): number {
  return (NEAR / 2) * (1 + Math.cos((azimuth * Math.PI) / 180));
}

function alignmentOf(join: SeamJoin, profile: DisparityProfile): SeamAlignment {
  return {
    join,
    disparities: Array.from({ length: SEAM_BIN_COUNT }, (_unused, bin) =>
      degrees(profile(seamBinAzimuth(bin))),
    ),
  };
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

interface OnScreen {
  readonly renderer: LabRenderer;
  readonly canvas: HTMLCanvasElement;
}

describe('the seam join', () => {
  const canvases: HTMLCanvasElement[] = [];
  const renderers: LabRenderer[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  afterEach(() => {
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  /**
   * Both lenses recording the ring scene near the camera, drawn as an equirectangular picture.
   */
  function openNearScene(disparity: DisparityProfile): OnScreen {
    const calibration = syntheticCalibration();
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK });
    const canvas = document.createElement('canvas');
    canvas.width = SIZE.width;
    canvas.height = SIZE.height;
    document.body.append(canvas);
    canvases.push(canvas);
    const renderer = LabRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    renderers.push(renderer);
    renderer.setViewMode('equirectangular');
    const pair = nearScenePair({ calibration, setup, disparity });
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
    scene: OnScreen,
    at: { readonly theta: number; readonly azimuths?: readonly number[] },
    gains: readonly Vector3[],
  ): number[] {
    scene.renderer.setLensGains(gains);
    const azimuths = at.azimuths ?? AZIMUTHS;
    return azimuths.map((azimuth) => levelTowards(scene.canvas, directionAt(at.theta, azimuth)));
  }

  it('draws the fixed join until a join is set', () => {
    const scene = openNearScene(constant(NEAR));
    const before = readPixels(scene.canvas);
    scene.renderer.setSeamAlignment(FIXED_SEAM_ALIGNMENT);
    expect(readPixels(scene.canvas)).toEqual(before);
  });

  it('draws a bent join without disparity as the fixed join', () => {
    const scene = openNearScene(constant(NEAR));
    const fixed = readPixels(scene.canvas);
    scene.renderer.setSeamAlignment(alignmentOf('bent', constant(0)));
    expect(largestDifference(readPixels(scene.canvas), fixed)).toBeLessThanOrEqual(1);
  });

  it('bends each lens by half the disparity, so the two images of a near scene meet at the seam', () => {
    const scene = openNearScene(constant(NEAR));
    for (const join of ['fixed', 'bent'] as const) {
      scene.renderer.setSeamAlignment(alignmentOf(join, constant(NEAR)));
      for (const theta of [88, 90, 92]) {
        const front = levelsAround(scene, { theta }, FRONT_ALONE);
        const back = levelsAround(scene, { theta }, BACK_ALONE);
        const difference = meanDifference(front, back);
        const at = `${join} join, ${theta} degrees from lens 0's axis`;
        if (join === 'bent') expect(difference, at).toBeLessThan(AGREEMENT_LEVELS);
        else expect(difference, at).toBeGreaterThan(10 * AGREEMENT_LEVELS);
      }
    }
  });

  it('bends each azimuth by its own bin’s disparity, across the start of the azimuths too', () => {
    const scene = openNearScene(aroundTheRing);
    scene.renderer.setSeamAlignment(alignmentOf('bent', aroundTheRing));
    const at = { theta: 90, azimuths: EDGE_AZIMUTHS };
    const front = levelsAround(scene, at, FRONT_ALONE);
    const back = levelsAround(scene, at, BACK_ALONE);
    for (const [index, azimuth] of EDGE_AZIMUTHS.entries()) {
      const difference = Math.abs((front[index] ?? NaN) - (back[index] ?? NaN));
      expect(difference, `${azimuth} degrees around the ring`).toBeLessThanOrEqual(2);
    }
  });

  it('cuts what it cannot bend: past the most it bends, one lens alone either side of the seam', () => {
    const farther = SEAM_MAX_BEND + SEAM_CUT_DISPARITY;
    const scene = openNearScene(constant(farther));
    scene.renderer.setSeamAlignment(alignmentOf('bent', constant(farther)));
    const nearerFront = levelsAround(scene, { theta: 89 }, BOTH);
    expect(
      meanDifference(nearerFront, levelsAround(scene, { theta: 89 }, FRONT_ALONE)),
    ).toBeLessThan(AGREEMENT_LEVELS);
    const nearerBack = levelsAround(scene, { theta: 91 }, BOTH);
    expect(meanDifference(nearerBack, levelsAround(scene, { theta: 91 }, BACK_ALONE))).toBeLessThan(
      AGREEMENT_LEVELS,
    );
  });

  it('leaves no gap between the lenses where it bends by the most and cuts the rest', () => {
    const farther = SEAM_MAX_BEND + SEAM_CUT_DISPARITY;
    const scene = openNearScene(constant(farther));
    scene.renderer.setSeamAlignment(alignmentOf('bent', constant(farther)));
    for (const theta of [89, 90, 91]) {
      const levels = levelsAround(scene, { theta }, BOTH);
      expect(Math.min(...levels), `${theta} degrees from lens 0's axis`).toBeGreaterThan(DARKEST);
    }
  });

  it('refuses an alignment with a disparity missing or not a finite angle', () => {
    const scene = openNearScene(constant(NEAR));
    const short = { join: 'bent', disparities: [degrees(1)] } as const;
    const unknown = alignmentOf('bent', (azimuth) => (azimuth > 180 ? NaN : 1));
    for (const alignment of [short, unknown]) {
      expect(() => {
        scene.renderer.setSeamAlignment(alignment);
      }).toThrow(expect.objectContaining({ code: 'invariant-violation' }));
    }
  });

  it('lets the mismatch meter find each bin’s disparity, sliding lens 0 across the ring', async () => {
    const scene = openNearScene(aroundTheRing);
    const meter = scene.renderer.createSeamMismatchMeter();
    const measured = await meter.measure({ disparities: disparityCandidatesOf(), gains: BOTH });
    if (!measured) throw new Error('the strip was not measured');
    for (const bin of binDisparitiesOf(measured)) {
      const at = `the bin at ${bin.azimuth} degrees`;
      expect(bin.isTrusted, at).toBe(true);
      expect(Math.abs(bin.disparity - aroundTheRing(bin.azimuth)), at).toBeLessThan(
        DISPARITY_TOLERANCE,
      );
    }
  });
});
