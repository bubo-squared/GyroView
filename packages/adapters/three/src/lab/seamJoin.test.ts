import {
  binDisparitiesOf,
  buildStitchingSetup,
  degrees,
  degreesToRadians,
  FIXED_SEAM_ALIGNMENT,
  SEAM_BIN_COUNT,
  SEAM_BIN_WIDTH,
  SEAM_CUT_DISPARITY,
  SEAM_MAX_BEND,
  seamBinAzimuth,
  seconds,
  slidesOf,
  type DecodedFrame,
  type Degrees,
  type SeamAlignment,
  type SeamJoin,
  type Vector3,
} from '@gyroview/core';
import { equirectangularDirectionOf, equirectangularPixelOf } from '@gyroview/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { LabRenderer } from './LabRenderer';
import { directionAt, nearScenePair, ringScene, type DisparityProfile } from './test/nearScene';
import { readPixels } from '../test/readPixels';
import { MULTI_TRACK, syntheticCalibration } from '../test/syntheticStitching';

const SIZE = { width: 256, height: 128 };
const RGBA = 4;
const CHANNEL_MAX = 255;
/**
 * How far apart the two lenses' images of a near scene lie at the seam: 4 degrees is an object
 * about 45 centimetres away, what a bent join bends by at most.
 */
const NEAR = 4;
const SEAM = degrees(90);
const UNIT_GAIN: Vector3 = [1, 1, 1];
const SILENT: Vector3 = [0, 0, 0];
const FRONT_ALONE: readonly Vector3[] = [UNIT_GAIN, SILENT];
const BACK_ALONE: readonly Vector3[] = [SILENT, UNIT_GAIN];
const BOTH: readonly Vector3[] = [UNIT_GAIN, UNIT_GAIN];
const AROUND_THE_SEAM: readonly Degrees[] = [88, 90, 92].map((theta) => degrees(theta));
const ACROSS_THE_CUT: readonly Degrees[] = [89, 90, 91].map((theta) => degrees(theta));
const AZIMUTHS: readonly Degrees[] = Array.from({ length: 36 }, (_unused, index) =>
  degrees(index * 10 + 5),
);
/**
 * Either side of the start of the azimuths, on the step there and across bins 0 to 2, and a
 * quarter turn apart.
 */
const EDGE_AZIMUTHS: readonly Degrees[] = [0, 1, 2.5, 10, 12.5, 15, 90, 180, 270, 357.5, 359].map(
  (azimuth) => degrees(azimuth),
);
/**
 * Two 8-bit frames of one smooth scene, read through bilinear taps, differ by a level or so; a
 * bend off by a tenth of a degree moves the ring scene by about one.
 */
const AGREEMENT_LEVELS = 1.5;
const EDGE_AGREEMENT_LEVELS = 2;
/**
 * The meter finds a bin's disparity within this: a bin read half a bin off, or mirrored, on the
 * asymmetric profile below is 0.17 degrees off or more.
 */
const DISPARITY_TOLERANCE = 0.08;
/**
 * The ring scene is nowhere darker than a tenth of the range; a gap between the lenses is black.
 */
const DARKEST = 20;

function constant(disparity: number): DisparityProfile {
  return () => degrees(disparity);
}

/**
 * The disparity the bent join reads at an azimuth for a field of bin values: between the centres
 * of the two nearest bins, across the start of the azimuths too.
 */
function interpolated(binValues: readonly number[]): DisparityProfile {
  return (azimuth) => {
    const fromCentre = azimuth / SEAM_BIN_WIDTH - 0.5;
    const below = Math.floor(fromCentre);
    const lower = valueOfBin(binValues, below);
    const upper = valueOfBin(binValues, below + 1);
    return degrees(lower + (upper - lower) * (fromCentre - below));
  };
}

function valueOfBin(binValues: readonly number[], bin: number): number {
  return binValues[(bin + SEAM_BIN_COUNT) % SEAM_BIN_COUNT] ?? 0;
}

/**
 * A step at the start of the azimuths: bins 0 to 2 near, every other bin, the last one too, far.
 */
const STEP_AT_THE_START = interpolated(
  Array.from({ length: SEAM_BIN_COUNT }, (_unused, bin) => (bin <= 2 ? NEAR : 0)),
);

/**
 * Near on one side of the ring and far on the other, and not alike either way round it.
 */
function asymmetric(azimuth: Degrees): Degrees {
  return degrees((NEAR / 2) * (1 + Math.sin(2 * degreesToRadians(azimuth))));
}

function alignmentOf(join: SeamJoin, profile: DisparityProfile): SeamAlignment {
  return {
    join,
    disparities: Array.from({ length: SEAM_BIN_COUNT }, (_unused, bin) =>
      profile(seamBinAzimuth(bin)),
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
   * The levels towards each azimuth at `theta` from lens 0's axis, drawn under the gains.
   */
  function levelsAround(
    scene: OnScreen,
    at: { readonly theta: Degrees; readonly azimuths?: readonly Degrees[] },
    gains: readonly Vector3[],
  ): number[] {
    scene.renderer.setLensGains(gains);
    const azimuths = at.azimuths ?? AZIMUTHS;
    return azimuths.map((azimuth) => levelTowards(scene.canvas, directionAt(at.theta, azimuth)));
  }

  function lensesApart(scene: OnScreen, at: { readonly theta: Degrees }): number {
    return meanDifference(
      levelsAround(scene, at, FRONT_ALONE),
      levelsAround(scene, at, BACK_ALONE),
    );
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

  it('leaves the fixed join’s two images of a near scene apart at the seam', () => {
    const scene = openNearScene(constant(NEAR));
    scene.renderer.setSeamAlignment(alignmentOf('fixed', constant(NEAR)));
    for (const theta of AROUND_THE_SEAM) {
      expect(lensesApart(scene, { theta }), `${theta} degrees`).toBeGreaterThan(
        10 * AGREEMENT_LEVELS,
      );
    }
  });

  it('bends each lens by half the disparity: the two images meet, where the scene lies', () => {
    const scene = openNearScene(constant(NEAR));
    scene.renderer.setSeamAlignment(alignmentOf('bent', constant(NEAR)));
    for (const theta of AROUND_THE_SEAM) {
      expect(lensesApart(scene, { theta }), `${theta} degrees`).toBeLessThan(AGREEMENT_LEVELS);
    }
    const drawn = levelsAround(scene, { theta: SEAM }, BOTH);
    const painted = AZIMUTHS.map((azimuth) => {
      const pixel = equirectangularPixelOf(directionAt(SEAM, azimuth), SIZE);
      return CHANNEL_MAX * ringScene(equirectangularDirectionOf(pixel, SIZE));
    });
    expect(meanDifference(drawn, painted)).toBeLessThan(EDGE_AGREEMENT_LEVELS);
  });

  it('bends each azimuth by its own bins’ disparity, across the step at the start of the azimuths', () => {
    const scene = openNearScene(STEP_AT_THE_START);
    scene.renderer.setSeamAlignment(alignmentOf('bent', STEP_AT_THE_START));
    const at = { theta: SEAM, azimuths: EDGE_AZIMUTHS };
    const front = levelsAround(scene, at, FRONT_ALONE);
    const back = levelsAround(scene, at, BACK_ALONE);
    for (const [index, azimuth] of EDGE_AZIMUTHS.entries()) {
      const difference = Math.abs((front[index] ?? NaN) - (back[index] ?? NaN));
      expect(difference, `${azimuth} degrees around the ring`).toBeLessThanOrEqual(
        EDGE_AGREEMENT_LEVELS,
      );
    }
  });

  it('cuts what it cannot bend: past the most it bends, one lens alone either side of the seam', () => {
    const farther = SEAM_MAX_BEND + SEAM_CUT_DISPARITY;
    const scene = openNearScene(constant(farther));
    scene.renderer.setSeamAlignment(alignmentOf('bent', constant(farther)));
    for (const [theta, alone] of [
      [degrees(89), FRONT_ALONE],
      [degrees(91), BACK_ALONE],
    ] as const) {
      const blended = levelsAround(scene, { theta }, BOTH);
      expect(meanDifference(blended, levelsAround(scene, { theta }, alone))).toBeLessThan(
        AGREEMENT_LEVELS,
      );
    }
  });

  it('leaves no gap between the lenses where it bends by the most and cuts the rest', () => {
    const farther = SEAM_MAX_BEND + SEAM_CUT_DISPARITY;
    const scene = openNearScene(constant(farther));
    scene.renderer.setSeamAlignment(alignmentOf('bent', constant(farther)));
    for (const theta of ACROSS_THE_CUT) {
      const levels = levelsAround(scene, { theta }, BOTH);
      expect(Math.min(...levels), `${theta} degrees from lens 0's axis`).toBeGreaterThan(DARKEST);
    }
  });

  it('refuses an alignment with a disparity missing or not a finite angle', () => {
    const scene = openNearScene(constant(NEAR));
    const short = { join: 'bent', disparities: [degrees(1)] } as const;
    const unknown = alignmentOf('bent', (azimuth) => degrees(azimuth > 180 ? NaN : 1));
    for (const alignment of [short, unknown]) {
      expect(() => {
        scene.renderer.setSeamAlignment(alignment);
      }).toThrow(expect.objectContaining({ code: 'invariant-violation' }));
    }
  });

  it('lets the mismatch meter find each bin’s disparity, sliding lens 0 across the ring', async () => {
    const scene = openNearScene(asymmetric);
    const meter = scene.renderer.createSeamMismatchMeter();
    const measured = await meter.measure({ slides: slidesOf(), gains: BOTH });
    if (!measured) throw new Error('the strip was not measured');
    for (const bin of binDisparitiesOf(measured)) {
      const at = `the bin at ${bin.azimuth} degrees`;
      expect(bin.isTrusted, at).toBe(true);
      expect(Math.abs(bin.disparity - asymmetric(bin.azimuth)), at).toBeLessThan(
        DISPARITY_TOLERANCE,
      );
    }
  });
});
