import { transformVector, type Matrix3, type Vector3 } from '@gyroview/core';

import type { BlockShift } from './blockField';
import type { CanvasSize } from './rendering';

/**
 * How much GyroView's content is displaced from the reference's, radially from the nearer
 * lens axis, as a share of the angle from that axis: `epsilon` in `dtheta = epsilon * theta`.
 * A model that draws every direction too close to its axis by that share needs its radius
 * scaled by `1 + epsilon`.
 */
export interface RadialFit {
  readonly epsilon: number;
  readonly blocksUsed: number;
}

const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;
const DEGREES_PER_HALF_TURN = 180;
const DEGREES_PER_RADIAN = DEGREES_PER_HALF_TURN / Math.PI;
/**
 * A pixel is read at its centre.
 */
const PIXEL_CENTRE = 0.5;
const MIN_CONTRAST = 0.3;
/**
 * Blocks above the boat, and away from the axes (where the radial direction is undefined) and
 * from the seam ring (where the two lenses mix).
 */
const FAR_FIELD_BOTTOM = 0.55;
const MIN_THETA_DEGREES = 15;
const MAX_THETA_DEGREES = 80;
const OUTLIER_FACTOR = 3;
const REFIT_ROUNDS = 2;
const HALF_BLOCK = 24;

/**
 * The direction seen through the centre of a pixel of the panorama, counted from the top-left,
 * in the view frame: the inverse of the stitching shader's ray.
 */
export function viewDirectionOf(column: number, row: number, size: CanvasSize): Vector3 {
  const yaw = ((column + PIXEL_CENTRE) / size.width) * 2 * HALF_TURN - HALF_TURN;
  const pitch = -(((row + PIXEL_CENTRE) / size.height) * 2 - 1) * QUARTER_TURN;
  return [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/**
 * The angle from the nearer lens axis (body +z or -z), in degrees.
 */
interface Frame {
  readonly size: CanvasSize;
  readonly viewToBody: Matrix3;
}

interface Point {
  readonly column: number;
  readonly row: number;
}

function thetaAt({ column, row }: Point, { size, viewToBody }: Frame): number {
  const [x, y, z] = transformVector(viewToBody, viewDirectionOf(column, row, size));
  const fromFront = Math.atan2(Math.hypot(x, y), z) * DEGREES_PER_RADIAN;
  return Math.min(fromFront, DEGREES_PER_HALF_TURN - fromFront);
}

interface RadialSample {
  readonly theta: number;
  /**
   * The radial displacement the block's shift amounts to, in degrees.
   */
  readonly displacement: number;
}

function sampleOf(block: BlockShift, frame: Frame): RadialSample {
  const column = block.column + HALF_BLOCK;
  const row = block.row + HALF_BLOCK;
  const theta = thetaAt({ column, row }, frame);
  const alongX = thetaAt({ column: column + 1, row }, frame) - theta;
  const alongY = thetaAt({ column, row: row + 1 }, frame) - theta;
  return { theta, displacement: block.dx * alongX + block.dy * alongY };
}

function isFarField(block: BlockShift, size: CanvasSize, theta: number): boolean {
  return (
    block.contrast > MIN_CONTRAST &&
    block.row < FAR_FIELD_BOTTOM * size.height &&
    theta > MIN_THETA_DEGREES &&
    theta < MAX_THETA_DEGREES
  );
}

function slopeOf(samples: readonly RadialSample[]): number {
  let numerator = 0;
  let denominator = 0;
  for (const sample of samples) {
    numerator += sample.displacement * sample.theta;
    denominator += sample.theta * sample.theta;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Least squares of `displacement = epsilon * theta` over the far-field blocks, the worst
 * outliers dropped and the fit repeated.
 */
export function radialScaleErrorOf(
  field: readonly BlockShift[],
  size: CanvasSize,
  viewToBody: Matrix3,
): RadialFit {
  const frame = { size, viewToBody };
  let samples = field
    .map((block) => ({ block, sample: sampleOf(block, frame) }))
    .filter(({ block, sample }) => isFarField(block, size, sample.theta))
    .map(({ sample }) => sample);
  let epsilon = slopeOf(samples);
  for (let round = 0; round < REFIT_ROUNDS; round += 1) {
    const residuals = samples.map((sample) =>
      Math.abs(sample.displacement - epsilon * sample.theta),
    );
    const median = residuals.toSorted((a, b) => a - b)[Math.floor(residuals.length / 2)] ?? 0;
    const limit = OUTLIER_FACTOR * Math.max(median, Number.EPSILON);
    samples = samples.filter((_sample, index) => (residuals[index] ?? Infinity) <= limit);
    epsilon = slopeOf(samples);
  }
  return { epsilon, blocksUsed: samples.length };
}
