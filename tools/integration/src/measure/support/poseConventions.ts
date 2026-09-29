import {
  degrees,
  degreesToRadians,
  lensRotation,
  mirroredRoll,
  multiplyMatrices,
  radians,
  radiansToDegrees,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  transformVector,
  transposeMatrix,
  type Degrees,
  type EulerDegrees,
  type LensCalibration,
  type Matrix3,
  type Radians,
  type Vector3,
} from '@gyroview/core';

/**
 * A small turn as a rotation vector in degrees about the body axes: x to the right, y down, z
 * forward along lens 0's optical axis.
 */
export interface BodyTurn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const MATRIX_SIZE = 3;
const HALF = 0.5;
/**
 * Below this angle, in radians, the turn's vector is read off the matrix directly.
 */
const SMALL_ANGLE = 1e-9;

function entryAt(matrix: Matrix3, row: number, column: number): number {
  return matrix[row * MATRIX_SIZE + column] ?? 0;
}

/**
 * The turn a rotation makes: its axis scaled by its angle.
 */
function turnOf(matrix: Matrix3): BodyTurn {
  const trace = entryAt(matrix, 0, 0) + entryAt(matrix, 1, 1) + entryAt(matrix, 2, 2);
  const angle = Math.acos(Math.min(1, Math.max(-1, (trace - 1) * HALF)));
  const scale = angle < SMALL_ANGLE ? HALF : angle / (2 * Math.sin(angle));
  const inDegrees = (value: number): number => radiansToDegrees(radians(value * scale));
  return {
    x: inDegrees(entryAt(matrix, 2, 1) - entryAt(matrix, 1, 2)),
    y: inDegrees(entryAt(matrix, 0, 2) - entryAt(matrix, 2, 0)),
    z: inDegrees(entryAt(matrix, 1, 0) - entryAt(matrix, 0, 1)),
  };
}

/**
 * Which of a lens's calibration angles are read with the other sign than the core reads them;
 * a roll is mirrored about its mounting, as the core's own reading does.
 */
export interface SignFlips {
  readonly yaw: boolean;
  readonly pitch: boolean;
  readonly roll: boolean;
}

function flippedOrientation(orientation: EulerDegrees, flips: SignFlips): EulerDegrees {
  return {
    yaw: degrees(flips.yaw ? -orientation.yaw : orientation.yaw),
    pitch: degrees(flips.pitch ? -orientation.pitch : orientation.pitch),
    roll: flips.roll ? mirroredRoll(orientation.roll) : orientation.roll,
  };
}

/**
 * The lens's rotation, body into lens, were its angles read with the flipped signs.
 */
export function flippedLensRotation(lens: LensCalibration, flips: SignFlips): Matrix3 {
  return lensRotation({ ...lens, orientation: flippedOrientation(lens.orientation, flips) });
}

/**
 * The relative turn the registration would measure if `truth` were the lenses' real rotations
 * and `used` the ones drawn with: `truth[0]ᵀ · used[0] · used[1]ᵀ · truth[1]`.
 */
export function predictedRelativeTurn(
  used: readonly [Matrix3, Matrix3],
  truth: readonly [Matrix3, Matrix3],
): BodyTurn {
  const first = multiplyMatrices(transposeMatrix(truth[0]), used[0]);
  const second = multiplyMatrices(transposeMatrix(used[1]), truth[1]);
  return turnOf(multiplyMatrices(first, second));
}

export type BodyAxis = keyof BodyTurn;

const ROTATIONS_ABOUT: Readonly<Record<BodyAxis, (angle: Radians) => Matrix3>> = {
  x: rotationAboutX,
  y: rotationAboutY,
  z: rotationAboutZ,
};

/**
 * A turn about a body axis, in degrees, applied to the body before the lens's own rotation.
 */
export function withTurnAbout(rotation: Matrix3, axis: BodyAxis, angle: Degrees): Matrix3 {
  const turn = ROTATIONS_ABOUT[axis](degreesToRadians(angle));
  return multiplyMatrices(rotation, turn);
}

/**
 * The lens's optical axis in body coordinates.
 */
export function opticalAxisOf(rotation: Matrix3): Vector3 {
  return transformVector(transposeMatrix(rotation), [0, 0, 1]);
}

/**
 * Every combination of sign flips for one lens.
 */
export function everySignFlip(): SignFlips[] {
  const flags = [false, true];
  return flags.flatMap((yaw) =>
    flags.flatMap((pitch) => flags.map((roll) => ({ yaw, pitch, roll }))),
  );
}
