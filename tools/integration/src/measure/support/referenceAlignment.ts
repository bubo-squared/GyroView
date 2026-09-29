import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import type { LabRenderer } from '@gyroview/adapter-three/lab';
import { readPixels } from '@gyroview/adapter-three/testing';
import {
  degrees,
  degreesToRadians,
  FULL_TURN,
  HALF_TURN,
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  type Degrees,
  type FramePair,
  type Matrix3,
} from '@gyroview/core';

import { greyOfDrawn, type GreyImage } from './referenceFrames';

/**
 * A renderer showing one pair under the gyro's lock stabilization, on top of which the
 * alignment turns the panorama.
 */
export interface LockedRendering<Renderer extends ThreeFrameRenderer = LabRenderer> {
  readonly renderer: Renderer;
  readonly canvas: HTMLCanvasElement;
  readonly pair: FramePair<VideoFrame>;
  /**
   * The lock stabilization of the pair: the stabilized frame into the body.
   */
  readonly lock: Matrix3;
}

/**
 * A turn of the whole panorama, about the view's axes: yaw about its vertical, then pitch, then
 * roll about its forward axis.
 */
export interface ViewTurn {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly roll: Degrees;
}

export const NO_TURN: ViewTurn = { yaw: degrees(0), pitch: degrees(0), roll: degrees(0) };

/**
 * The turn of GyroView's panorama that best matches the reference, and the far-field cost left.
 */
export interface Alignment {
  readonly turn: ViewTurn;
  readonly cost: number;
}

/**
 * A band of rows, as fractions of the panorama's height from the top.
 */
export interface RowBand {
  readonly top: number;
  readonly bottom: number;
}

/**
 * The rows the alignment compares: the upper band, above the horizon (the sky and the far coast
 * over the boat, the ceiling and the upper walls indoors).
 */
const FAR_FIELD_TOP = 0.15;
const FAR_FIELD_BOTTOM = 0.5;
export const FAR_FIELD_BAND: RowBand = { top: FAR_FIELD_TOP, bottom: FAR_FIELD_BOTTOM };
const COMPARISON_STRIDE = 2;
const COARSE_YAW_STEP_PIXELS = 4;
/**
 * A search from nothing takes a column search for the yaw and this many rounds of one-axis
 * searches; a search from a turn already close takes fewer.
 */
const DESCENT_ROUNDS = 3;
const REFINEMENT_ROUNDS = 1;
/**
 * The angles tried around the current best in each round, per axis.
 */
const DESCENT_EXTENT_DEGREES = 2;
const DESCENT_STEP_DEGREES = 0.2;

export function rotationOf(turn: ViewTurn): Matrix3 {
  const yawed = rotationAboutY(degreesToRadians(turn.yaw));
  const pitched = rotationAboutX(degreesToRadians(turn.pitch));
  const rolled = rotationAboutZ(degreesToRadians(turn.roll));
  return multiplyMatrices(yawed, multiplyMatrices(pitched, rolled));
}

/**
 * GyroView's panorama under the given turn, as a grey image from the top down.
 */
export function renderUnder(
  rendering: LockedRendering<ThreeFrameRenderer>,
  turn: ViewTurn,
): GreyImage {
  const { renderer, canvas, pair, lock } = rendering;
  renderer.setStabilization(multiplyMatrices(lock, rotationOf(turn)));
  renderer.present({ pair, mediaTime: pair.timestamp });
  const size = { width: canvas.width, height: canvas.height };
  return { ...size, data: greyOfDrawn(readPixels(canvas), size) };
}

/**
 * Mean absolute difference over the far-field rows, the candidate read `columnShift` columns
 * to the right of the reference.
 */
function farFieldCost(reference: GreyImage, candidate: GreyImage, columnShift = 0): number {
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

type Axis = keyof ViewTurn;
const AXES: readonly Axis[] = ['yaw', 'pitch', 'roll'];

function withAxis(turn: ViewTurn, axis: Axis, value: number): ViewTurn {
  return { ...turn, [axis]: degrees(value) };
}

/**
 * The reference and the rendering compared against it.
 */
interface Comparison {
  readonly reference: GreyImage;
  readonly rendering: LockedRendering;
}

/**
 * Turns GyroView's panorama to match the reference: a column search for the yaw, then rounds
 * of one-axis searches around the best so far.
 */
export function alignToReference(reference: GreyImage, rendering: LockedRendering): Alignment {
  const yaw = initialYaw(reference, renderUnder(rendering, NO_TURN));
  return descended({ reference, rendering }, withAxis(NO_TURN, 'yaw', yaw), DESCENT_ROUNDS);
}

/**
 * As {@link alignToReference}, from a turn already close to the answer: one round.
 */
export function refineAlignment(
  reference: GreyImage,
  rendering: LockedRendering,
  from: ViewTurn,
): Alignment {
  return descended({ reference, rendering }, from, REFINEMENT_ROUNDS);
}

function descended(comparison: Comparison, start: ViewTurn, rounds: number): Alignment {
  let best: Alignment = {
    turn: start,
    cost: farFieldCost(comparison.reference, renderUnder(comparison.rendering, start)),
  };
  for (let round = 0; round < rounds; round += 1) {
    for (const axis of AXES) best = bestAlongAxis(comparison, best, axis);
  }
  return best;
}

/**
 * The best of the angles tried about one axis around the best so far, the best so far kept
 * on a tie.
 */
function bestAlongAxis(comparison: Comparison, sofar: Alignment, axis: Axis): Alignment {
  const { reference, rendering } = comparison;
  let best = sofar;
  const centre = sofar.turn[axis];
  const steps = Math.round(DESCENT_EXTENT_DEGREES / DESCENT_STEP_DEGREES);
  for (let step = -steps; step <= steps; step += 1) {
    const candidate = withAxis(sofar.turn, axis, centre + step * DESCENT_STEP_DEGREES);
    const cost = farFieldCost(reference, renderUnder(rendering, candidate));
    if (cost < best.cost) best = { turn: candidate, cost };
  }
  return best;
}
