import type { LabRenderer } from '@gyroview/adapter-three/lab';
import {
  degrees,
  degreesToRadians,
  indexOfLeast,
  parabolicOffset,
  transformVector,
  type Degrees,
  type Matrix3,
  type Vector3,
} from '@gyroview/core';

import { withTurnAbout, type BodyAxis } from './poseConventions';
import {
  renderUnder,
  type LockedRendering,
  type RowBand,
  type ViewTurn,
} from './referenceAlignment';
import type { GreyImage } from './referenceFrames';
import { gainsShowingOnly, viewDirectionOf, type CanvasSize } from '../../browser/rendering';

/**
 * A level difference counts at most this much: where Studio's dynamic stitching warps a near
 * object, the difference says nothing about the lens's pose.
 */
const DIFFERENCE_CAP = 48;
/**
 * The turns tried about a body axis: the factory reading's error is well inside.
 */
const LINE_EXTENT_DEGREES = 2;
const LINE_STEP_DEGREES = 0.1;
const SHOWN: Vector3 = [1, 1, 1];
const COMPARED = 1;

/**
 * The panorama's pixels a cost reads: `COMPARED` where it counts one.
 */
export type ComparedPixels = Uint8Array;

/**
 * Every pixel of the band.
 */
export function bandPixels(size: CanvasSize, band: RowBand): ComparedPixels {
  const compared = new Uint8Array(size.width * size.height);
  const first = Math.floor(band.top * size.height) * size.width;
  const last = Math.ceil(band.bottom * size.height) * size.width;
  compared.fill(COMPARED, first, last);
  return compared;
}

/**
 * Around a lens's optical axis, where no parallax displaces what it sees.
 */
export interface Cone {
  readonly viewToBody: Matrix3;
  readonly axis: Vector3;
  readonly halfAngle: Degrees;
  readonly band: RowBand;
}

/**
 * The pixels of the band whose direction lies within the cone.
 */
export function conePixels(size: CanvasSize, cone: Cone): ComparedPixels {
  const compared = bandPixels(size, cone.band);
  const minCosine = Math.cos(degreesToRadians(cone.halfAngle));
  for (const [index, isCompared] of compared.entries()) {
    if (isCompared !== COMPARED) continue;
    const view = viewDirectionOf(index % size.width, Math.floor(index / size.width), size);
    const body = transformVector(cone.viewToBody, view);
    const cosine = body[0] * cone.axis[0] + body[1] * cone.axis[1] + body[2] * cone.axis[2];
    if (cosine < minCosine) compared[index] = 0;
  }
  return compared;
}

function unitGains(renderer: LabRenderer): Vector3[] {
  return Array.from({ length: renderer.lensCount }, () => SHOWN);
}

/**
 * Mean capped level difference over the compared pixels where the candidate shows a lens: a
 * black candidate pixel lies outside the lens drawn alone.
 */
function lensCost(reference: GreyImage, candidate: GreyImage, compared: ComparedPixels): number {
  let total = 0;
  let count = 0;
  for (const [index, isCompared] of compared.entries()) {
    const shown = candidate.data[index] ?? 0;
    if (isCompared !== COMPARED || shown === 0) continue;
    total += Math.min(DIFFERENCE_CAP, Math.abs((reference.data[index] ?? 0) - shown));
    count += 1;
  }
  return count === 0 ? Infinity : total / count;
}

export interface LineMinimum {
  /**
   * Where the cost is least, refined between the samples by a parabola through the best three.
   */
  readonly at: Degrees;
  readonly cost: number;
  /**
   * The least sampled cost lay at an end of the range: the true minimum may lie beyond it.
   */
  readonly isAtBoundary: boolean;
}

/**
 * The least of `evaluate` over the turns from -LINE_EXTENT_DEGREES to LINE_EXTENT_DEGREES,
 * sampled every LINE_STEP_DEGREES.
 */
function lineMinimum(evaluate: (angle: Degrees) => number): LineMinimum {
  const steps = Math.round(LINE_EXTENT_DEGREES / LINE_STEP_DEGREES);
  const costs = Array.from({ length: 2 * steps + 1 }, (_unused, index) =>
    evaluate(degrees((index - steps) * LINE_STEP_DEGREES)),
  );
  const best = indexOfLeast(costs);
  return {
    at: degrees((best - steps + parabolicOffset(costs, best)) * LINE_STEP_DEGREES),
    cost: costs[best] ?? Infinity,
    isAtBoundary: best === 0 || best === costs.length - 1,
  };
}

/**
 * One lens's search: its pose, the view turn it is drawn under, the body axis turned about and
 * the pixels compared.
 */
interface LensTurnSearch {
  readonly lensIndex: number;
  readonly pose: Matrix3;
  readonly view: ViewTurn;
  readonly axis: BodyAxis;
  readonly compared: ComparedPixels;
}

/**
 * The turn about a body axis, given to the lens's pose, that registers the lens drawn alone on
 * the reference.
 */
export function turnRegistering(
  reference: GreyImage,
  rendering: LockedRendering,
  search: LensTurnSearch,
): LineMinimum {
  const { renderer } = rendering;
  const { lensIndex, pose, view, axis, compared } = search;
  renderer.setLensGains(gainsShowingOnly(unitGains(renderer), lensIndex));
  const found = lineMinimum((angle) => {
    renderer.setLensPose(lensIndex, withTurnAbout(pose, axis, angle));
    return lensCost(reference, renderUnder(rendering, view), compared);
  });
  renderer.setLensPose(lensIndex, pose);
  renderer.setLensGains(unitGains(renderer));
  return found;
}
