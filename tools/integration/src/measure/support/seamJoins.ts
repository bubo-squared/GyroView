import type { LabRenderer } from '@gyroview/adapter-three/lab';
import { readPixels } from '@gyroview/adapter-three/testing';
import {
  binDisparitiesOf,
  FULL_TURN,
  degrees,
  DEFAULT_MAX_GAIN,
  disparityFieldOf,
  gainsMatching,
  isWithinArc,
  milliseconds,
  NADIR_ARC,
  radians,
  radiansToDegrees,
  SEAM_BIN_COUNT,
  SEAM_BIN_WIDTH,
  SEAM_RING_ANGLE,
  slidesOf,
  transformVector,
  type BinDisparity,
  type Degrees,
  type Matrix3,
  type Milliseconds,
  type Vector3,
} from '@gyroview/core';

import type { LockedRendering } from './referenceAlignment';
import type { GreyImage } from './referenceFrames';
import { viewDirectionOf, type CanvasSize } from '../../browser/rendering';

/**
 * The pixels compared around the seam: within this many degrees of the seam ring, the 5-degree
 * feather band and a degree beyond.
 */
const BAND_HALF_WIDTH_DEGREES = 6;
/**
 * A pixel no seam bin holds: outside the band, under the camera, or left out of a comparison.
 */
const NO_BIN = -1;

/**
 * Each panorama pixel's seam bin, or {@link NO_BIN}.
 */
export type SeamBand = Int16Array;

/**
 * Which seam bin each pixel of a panorama drawn with `viewToBody` lies in, within the band
 * around the ring and outside the arc under the camera.
 */
export function seamBandOf(size: CanvasSize, viewToBody: Matrix3): SeamBand {
  const band = new Int16Array(size.width * size.height).fill(NO_BIN);
  for (let index = 0; index < band.length; index += 1) {
    const view = viewDirectionOf(index % size.width, Math.floor(index / size.width), size);
    const { theta, azimuth } = seamAnglesOf(transformVector(viewToBody, view));
    const isInBand = Math.abs(theta - SEAM_RING_ANGLE) <= BAND_HALF_WIDTH_DEGREES;
    if (isInBand && !isWithinArc(azimuth, NADIR_ARC)) {
      band[index] = Math.floor(azimuth / SEAM_BIN_WIDTH);
    }
  }
  return band;
}

/**
 * A body direction's angle from body +z, and its azimuth from +x towards +y (0 to 360).
 */
function seamAnglesOf([x, y, z]: Vector3): { theta: Degrees; azimuth: Degrees } {
  const across = Math.hypot(x, y);
  const theta = radiansToDegrees(radians(Math.atan2(across, z)));
  const signedAzimuth = radiansToDegrees(radians(Math.atan2(y, x)));
  return { theta, azimuth: degrees((signedAzimuth + FULL_TURN) % FULL_TURN) };
}

/**
 * The mean level difference between two images in every seam bin, over the band's pixels
 * both show (a black pixel lies outside a lens drawn alone); NaN in a bin with none.
 */
export function binDifferences(a: GreyImage, b: GreyImage, band: SeamBand): number[] {
  const totals = new Float64Array(SEAM_BIN_COUNT);
  const counts = new Float64Array(SEAM_BIN_COUNT);
  for (const [index, bin] of band.entries()) {
    const difference = shownDifference(a.data[index] ?? 0, b.data[index] ?? 0);
    if (bin === NO_BIN || difference === undefined) continue;
    totals[bin] = (totals[bin] ?? 0) + difference;
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  return Array.from(totals, (total, bin) => total / (counts[bin] ?? 0));
}

/**
 * The level difference of two pixels, unless either is black.
 */
function shownDifference(first: number, second: number): number | undefined {
  return first === 0 || second === 0 ? undefined : Math.abs(first - second);
}

/**
 * The band without the pixels any of the images leaves black: those a lens drawn alone does not
 * reach, so that differences between joins are taken over the same pixels.
 */
export function bandShownBy(band: SeamBand, images: readonly GreyImage[]): SeamBand {
  return band.map((bin, index) =>
    images.every((image) => (image.data[index] ?? 0) > 0) ? bin : NO_BIN,
  );
}

/**
 * The gains gain matching gives the frames on screen, measured along the seam as the player
 * measures them.
 */
export async function matchedGains(renderer: LabRenderer): Promise<Vector3[]> {
  const meter = renderer.createSeamMeter();
  try {
    const means = await meter.measure();
    if (!means) throw new Error('the seam was not measured');
    return gainsMatching(means, DEFAULT_MAX_GAIN);
  } finally {
    meter.dispose();
  }
}

/**
 * The disparity measured in every bin of the frames on screen, the field made of them, and how
 * long the measurement took, read-back included.
 */
export interface MeasuredDisparity {
  readonly bins: readonly BinDisparity[];
  readonly field: readonly Degrees[];
  readonly milliseconds: Milliseconds;
}

export async function measuredDisparity(
  renderer: LabRenderer,
  gains: readonly Vector3[],
): Promise<MeasuredDisparity> {
  const meter = renderer.createSeamMismatchMeter();
  try {
    const started = performance.now();
    const costs = await meter.measure({ slides: slidesOf(), gains });
    if (!costs) throw new Error('the seam strip was not measured');
    const milliseconds = sinceStart(started);
    const bins = binDisparitiesOf(costs);
    return { bins, field: disparityFieldOf(bins), milliseconds };
  } finally {
    meter.dispose();
  }
}

function sinceStart(started: number): Milliseconds {
  return milliseconds(performance.now() - started);
}

/**
 * Draws timed to take the mean of, after one untimed draw that warms the caches.
 */
const TIMED_DRAWS = 30;

/**
 * Milliseconds per draw of the two pairs in turn, the pixels read back at the end so the GPU
 * has finished.
 */
export function millisecondsPerDraw(
  renderings: readonly [LockedRendering, LockedRendering],
): Milliseconds {
  const draw = (rendering: LockedRendering): void => {
    rendering.renderer.setStabilization(rendering.lock);
    rendering.renderer.present({ pair: rendering.pair, mediaTime: rendering.pair.timestamp });
  };
  draw(renderings[0]);
  const started = performance.now();
  for (let index = 0; index < TIMED_DRAWS; index += 1) draw(renderings[index % 2] ?? renderings[0]);
  readPixels(renderings[0].canvas);
  return milliseconds((performance.now() - started) / TIMED_DRAWS);
}
