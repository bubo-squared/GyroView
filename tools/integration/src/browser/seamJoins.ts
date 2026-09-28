import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  binDisparitiesOf,
  degrees,
  DEFAULT_MAX_GAIN,
  disparityCandidatesOf,
  disparityFieldOf,
  gainsMatching,
  isWithinArc,
  NADIR_ARC,
  radians,
  radiansToDegrees,
  SEAM_BIN_COUNT,
  SEAM_BIN_WIDTH,
  transformVector,
  type BinDisparity,
  type Degrees,
  type Matrix3,
  type Vector3,
} from '@gyroview/core';

import { viewDirectionOf } from './radialFit';
import type { GreyImage } from './referenceFrames';
import type { CanvasSize } from './rendering';

/**
 * The pixels compared around the seam: within this many degrees of the ring 90 degrees from
 * body +z, the span a bend moves content over at the seam.
 */
const BAND_HALF_WIDTH = 6;
const QUARTER_TURN = 90;
const FULL_TURN = 360;
/**
 * A pixel no seam bin holds: outside the band, or under the camera.
 */
export const NO_BIN = -1;

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
    const isInBand = Math.abs(theta - QUARTER_TURN) <= BAND_HALF_WIDTH;
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
 * The gains gain matching gives the frames on screen, measured along the seam as the player
 * measures them.
 */
export async function matchedGains(renderer: ThreeFrameRenderer): Promise<Vector3[]> {
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
  readonly milliseconds: number;
}

export async function measuredDisparity(
  renderer: ThreeFrameRenderer,
  gains: readonly Vector3[],
): Promise<MeasuredDisparity> {
  const meter = renderer.createSeamMismatchMeter();
  try {
    const started = performance.now();
    const costs = await meter.measure({
      lensIndex: 0,
      candidates: { kind: 'shifts', shifts: disparityCandidatesOf() },
      gains,
    });
    if (!costs) throw new Error('the seam strip was not measured');
    const milliseconds = performance.now() - started;
    const bins = binDisparitiesOf(costs);
    return { bins, field: disparityFieldOf(bins), milliseconds };
  } finally {
    meter.dispose();
  }
}
