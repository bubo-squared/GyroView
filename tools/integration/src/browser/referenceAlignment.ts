import { readPixels } from '@gyroview/adapter-three/testing';
import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  degrees,
  degreesToRadians,
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  type FramePair,
  type Matrix3,
  type PoseDelta,
} from '@gyroview/core';

import { greyOf, type GreyImage } from './referenceFrames';

/**
 * A renderer showing one pair under the gyro's lock stabilization, on top of which the
 * alignment turns the panorama.
 */
export interface Renderable {
  readonly renderer: ThreeFrameRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly pair: FramePair<VideoFrame>;
  /**
   * The lock stabilization of the pair: the stabilized frame into the body.
   */
  readonly lock: Matrix3;
}

/**
 * The reference and the renderer compared against it.
 */
interface Comparison {
  readonly reference: GreyImage;
  readonly renderable: Renderable;
}

export interface Alignment {
  /**
   * The turn of GyroView's panorama that best matches the reference: view frame into body.
   */
  readonly rotation: PoseDelta;
  readonly cost: number;
  readonly initialCost: number;
}

/**
 * The rows compared: the sky, the horizon and the far coast, above the boat.
 */
const FAR_FIELD_TOP = 0.15;
const FAR_FIELD_BOTTOM = 0.5;
const COMPARISON_STRIDE = 2;
const COARSE_YAW_STEP_PIXELS = 4;
const DESCENT_ROUNDS = 3;
/**
 * The angles tried around the current best in each round, per axis.
 */
const DESCENT_EXTENT_DEGREES = 2;
const DESCENT_STEP_DEGREES = 0.2;
const FULL_TURN = 360;
const HALF_TURN = 180;

export function rotationOf(delta: PoseDelta): Matrix3 {
  const yawed = rotationAboutY(degreesToRadians(delta.yaw));
  const pitched = rotationAboutX(degreesToRadians(delta.pitch));
  const rolled = rotationAboutZ(degreesToRadians(delta.roll));
  return multiplyMatrices(yawed, multiplyMatrices(pitched, rolled));
}

/**
 * GyroView's panorama under the given turn, as a grey image from the top down.
 */
export function renderUnder(renderable: Renderable, delta: PoseDelta): GreyImage {
  const { renderer, canvas, pair, lock } = renderable;
  renderer.setStabilization(multiplyMatrices(lock, rotationOf(delta)));
  renderer.present({ pair, mediaTime: pair.timestamp });
  const size = { width: canvas.width, height: canvas.height };
  return { ...size, data: greyOf(readPixels(canvas), true, size) };
}

/**
 * Mean absolute difference over the far-field rows, the candidate read `columnShift` columns
 * to the right of the reference.
 */
export function farFieldCost(reference: GreyImage, candidate: GreyImage, columnShift = 0): number {
  const { width, height } = reference;
  let total = 0;
  let count = 0;
  for (
    let row = Math.floor(FAR_FIELD_TOP * height);
    row < FAR_FIELD_BOTTOM * height;
    row += COMPARISON_STRIDE
  ) {
    for (let column = 0; column < width; column += COMPARISON_STRIDE) {
      const shifted = (((column + columnShift) % width) + width) % width;
      total += Math.abs(
        (reference.data[row * width + column] ?? 0) - (candidate.data[row * width + shifted] ?? 0),
      );
      count += 1;
    }
  }
  return total / count;
}

/**
 * The yaw that best matches, from a column search over the render at rest.
 */
function initialYaw(reference: GreyImage, atRest: GreyImage): number {
  let best = { shift: 0, cost: Infinity };
  for (let shift = 0; shift < reference.width; shift += COARSE_YAW_STEP_PIXELS) {
    const cost = farFieldCost(reference, atRest, shift);
    if (cost < best.cost) best = { shift, cost };
  }
  for (
    let shift = best.shift - COARSE_YAW_STEP_PIXELS;
    shift <= best.shift + COARSE_YAW_STEP_PIXELS;
    shift += 1
  ) {
    const cost = farFieldCost(reference, atRest, shift);
    if (cost < best.cost) best = { shift, cost };
  }
  // Reading the render `shift` columns to the right is turning the view by that much.
  const yaw = (best.shift / reference.width) * FULL_TURN;
  return yaw > HALF_TURN ? yaw - FULL_TURN : yaw;
}

type Axis = keyof PoseDelta;
const AXES: readonly Axis[] = ['yaw', 'pitch', 'roll'];

function withAxis(delta: PoseDelta, axis: Axis, value: number): PoseDelta {
  return { ...delta, [axis]: degrees(value) };
}

/**
 * Turns GyroView's panorama to match the reference: a column search for the yaw, then rounds
 * of one-axis searches around the best so far.
 */
export function alignToReference(
  reference: GreyImage,
  renderable: Renderable,
  from?: PoseDelta,
): Alignment {
  const rest: PoseDelta = { yaw: degrees(0), pitch: degrees(0), roll: degrees(0) };
  const initialCost = farFieldCost(reference, renderUnder(renderable, rest));
  const start = from ?? withAxis(rest, 'yaw', initialYaw(reference, renderUnder(renderable, rest)));
  let best: Scored = {
    delta: start,
    cost: farFieldCost(reference, renderUnder(renderable, start)),
  };
  const comparison = { reference, renderable };
  // A start near the answer needs one round; the column search's yaw needs the rest.
  const rounds = from ? 1 : DESCENT_ROUNDS;
  for (let round = 0; round < rounds; round += 1) {
    for (const axis of AXES) best = bestAlongAxis(comparison, best, axis);
  }
  return { rotation: best.delta, cost: best.cost, initialCost };
}

interface Scored {
  readonly delta: PoseDelta;
  readonly cost: number;
}

/**
 * The best of the angles tried about one axis around the best so far, the best so far kept
 * on a tie.
 */
function bestAlongAxis(comparison: Comparison, sofar: Scored, axis: Axis): Scored {
  const { reference, renderable } = comparison;
  let best = sofar;
  const centre = sofar.delta[axis];
  const steps = Math.round(DESCENT_EXTENT_DEGREES / DESCENT_STEP_DEGREES);
  for (let step = -steps; step <= steps; step += 1) {
    const candidate = withAxis(sofar.delta, axis, centre + step * DESCENT_STEP_DEGREES);
    const cost = farFieldCost(reference, renderUnder(renderable, candidate));
    if (cost < best.cost) best = { delta: candidate, cost };
  }
  return best;
}
