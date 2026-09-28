import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import { transformVector, type Matrix3, type PoseDelta, type Vector3 } from '@gyroview/core';

import { viewDirectionOf } from './radialFit';
import { withTurnAbout, type BodyAxis } from './poseConventions';
import { renderUnder, type Renderable } from './referenceAlignment';
import type { GreyImage } from './referenceFrames';
import type { CanvasSize } from './rendering';

/**
 * A level difference counts at most this much: where Studio's dynamic stitching warps a near
 * object, the difference says nothing about the lens's pose.
 */
const DIFFERENCE_CAP = 48;
/**
 * The turns tried about a body axis, in degrees: the factory reading's error is well inside.
 */
const LINE_EXTENT = 2;
const LINE_STEP = 0.1;
const SHOWN: Vector3 = [1, 1, 1];
const SILENT: Vector3 = [0, 0, 0];
const COMPARED = 1;
const DEGREES_PER_HALF_TURN = 180;

/**
 * The panorama's pixels a cost reads: `COMPARED` where it counts one.
 */
export type ComparedPixels = Uint8Array;

/**
 * A band of rows, as fractions of the panorama's height from the top.
 */
export interface RowBand {
  readonly top: number;
  readonly bottom: number;
}

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
  readonly halfAngle: number;
  readonly band: RowBand;
}

/**
 * The pixels of the band whose direction lies within the cone.
 */
export function conePixels(size: CanvasSize, cone: Cone): ComparedPixels {
  const compared = bandPixels(size, cone.band);
  const minCosine = Math.cos((cone.halfAngle * Math.PI) / DEGREES_PER_HALF_TURN);
  for (const [index, isCompared] of compared.entries()) {
    if (isCompared !== COMPARED) continue;
    const view = viewDirectionOf(index % size.width, Math.floor(index / size.width), size);
    const body = transformVector(cone.viewToBody, view);
    const cosine = body[0] * cone.axis[0] + body[1] * cone.axis[1] + body[2] * cone.axis[2];
    if (cosine < minCosine) compared[index] = 0;
  }
  return compared;
}

/**
 * Draws only `lensIndex`: the other lenses silenced, it fills its whole field up to where its
 * feather ends, and every other pixel is black.
 */
export function showOnly(renderer: ThreeFrameRenderer, lensIndex: number): void {
  const gains = Array.from({ length: renderer.lensCount }, (_unused, index) =>
    index === lensIndex ? SHOWN : SILENT,
  );
  renderer.setLensGains(gains);
}

export function showAll(renderer: ThreeFrameRenderer): void {
  renderer.setLensGains(Array.from({ length: renderer.lensCount }, () => SHOWN));
}

/**
 * Mean capped level difference over the compared pixels where the candidate shows a lens: a
 * black candidate pixel lies outside the lens drawn alone.
 */
export function lensCost(
  reference: GreyImage,
  candidate: GreyImage,
  compared: ComparedPixels,
): number {
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
  readonly at: number;
  readonly cost: number;
  /**
   * The least sampled cost lay at an end of the range: the true minimum may lie beyond it.
   */
  readonly isAtBoundary: boolean;
}

function indexOfLeast(costs: readonly number[]): number {
  let best = 0;
  for (const [index, cost] of costs.entries()) if (cost < (costs[best] ?? Infinity)) best = index;
  return best;
}

/**
 * The vertex of the parabola through the costs at `index` and its neighbours, in steps from
 * `index`; nothing when the three do not bend upwards.
 */
function parabolicOffset(costs: readonly number[], index: number): number {
  const left = costs[index - 1];
  const centre = costs[index];
  const right = costs[index + 1];
  if (left === undefined || centre === undefined || right === undefined) return 0;
  const curvature = left - 2 * centre + right;
  return curvature > 0 ? (left - right) / (2 * curvature) : 0;
}

/**
 * The least of `evaluate` over [-LINE_EXTENT, LINE_EXTENT], sampled every LINE_STEP.
 */
export function lineMinimum(evaluate: (value: number) => number): LineMinimum {
  const steps = Math.round(LINE_EXTENT / LINE_STEP);
  const costs = Array.from({ length: 2 * steps + 1 }, (_unused, index) =>
    evaluate((index - steps) * LINE_STEP),
  );
  const best = indexOfLeast(costs);
  return {
    at: (best - steps + parabolicOffset(costs, best)) * LINE_STEP,
    cost: costs[best] ?? Infinity,
    isAtBoundary: best === 0 || best === costs.length - 1,
  };
}

/**
 * One lens's search: its pose, the view turn it is drawn under, the body axis turned about and
 * the pixels compared.
 */
export interface LensTurnSearch {
  readonly lensIndex: number;
  readonly pose: Matrix3;
  readonly view: PoseDelta;
  readonly axis: BodyAxis;
  readonly compared: ComparedPixels;
}

/**
 * The turn about a body axis, given to the lens's pose, that registers the lens drawn alone on
 * the reference.
 */
export function turnRegistering(
  reference: GreyImage,
  renderable: Renderable,
  search: LensTurnSearch,
): LineMinimum {
  const { renderer } = renderable;
  const { lensIndex, pose, view, axis, compared } = search;
  showOnly(renderer, lensIndex);
  const found = lineMinimum((angle) => {
    renderer.setLensPose(lensIndex, withTurnAbout(pose, axis, angle));
    return lensCost(reference, renderUnder(renderable, view), compared);
  });
  renderer.setLensPose(lensIndex, pose);
  showAll(renderer);
  return found;
}
