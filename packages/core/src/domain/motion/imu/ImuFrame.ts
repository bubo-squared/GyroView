import { ensureInvariant } from '../../../shared/errors/GyroViewError';
import { determinantOf, transformVector, type Matrix3 } from '../../../shared/math/Matrix3';
import type { Vector3 } from '../../../shared/math/Vector3';

/**
 * One body axis expressed as a signed IMU axis, for example `-y`: body x = minus IMU y.
 */
export type SignedAxis = 'x' | 'y' | 'z' | '-x' | '-y' | '-z';

/**
 * How the IMU's axes lie in the camera body frame (x right, y down, z along lens 0).
 */
export interface ImuFrame {
  readonly name: string;
  /**
   * Turns IMU-frame vectors (acceleration, angular velocity) into body-frame vectors.
   */
  readonly toBody: Matrix3;
  /**
   * True when the mapping was measured on a recording of this camera, false for a default that
   * still needs a real file.
   */
  readonly isVerified: boolean;
}

const AXIS_VECTORS: ReadonlyMap<SignedAxis, Vector3> = new Map<SignedAxis, Vector3>([
  ['x', [1, 0, 0]],
  ['y', [0, 1, 0]],
  ['z', [0, 0, 1]],
  ['-x', [-1, 0, 0]],
  ['-y', [0, -1, 0]],
  ['-z', [0, 0, -1]],
]);

function axisVector(axis: SignedAxis): Vector3 {
  const vector = AXIS_VECTORS.get(axis);
  ensureInvariant(vector !== undefined, `unknown IMU axis ${axis}`);
  return vector;
}

/**
 * The IMU axis each body axis reads from, in body order x, y, z.
 */
export type BodyAxes = readonly [x: SignedAxis, y: SignedAxis, z: SignedAxis];

function toBodyMatrixOf(bodyAxes: BodyAxes): Matrix3 {
  const [rowX, rowY, rowZ] = bodyAxes.map((axis) => axisVector(axis)) as [
    Vector3,
    Vector3,
    Vector3,
  ];
  return [...rowX, ...rowY, ...rowZ];
}

/**
 * Only a proper rotation is a frame: a repeated axis is singular and a reflection would
 * integrate a mirrored world.
 */
export function isProperRotation(bodyAxes: BodyAxes): boolean {
  return determinantOf(toBodyMatrixOf(bodyAxes)) === 1;
}

/**
 * A frame measured on a recording of the camera it is for.
 */
export function measuredImuFrame(name: string, bodyAxes: BodyAxes): ImuFrame {
  return { ...frameOf(name, bodyAxes), isVerified: true };
}

/**
 * A frame assumed until a recording proves it; it still needs a real file.
 */
export function assumedImuFrame(name: string, bodyAxes: BodyAxes): ImuFrame {
  return { ...frameOf(name, bodyAxes), isVerified: false };
}

function frameOf(name: string, bodyAxes: BodyAxes): Omit<ImuFrame, 'isVerified'> {
  ensureInvariant(isProperRotation(bodyAxes), `IMU axes ${bodyAxes.join(', ')} are not a rotation`);
  return { name, toBody: toBodyMatrixOf(bodyAxes) };
}

export function toBodyFrame(frame: ImuFrame, imuVector: Vector3): Vector3 {
  return transformVector(frame.toBody, imuVector);
}

/**
 * Measured on two X5 recordings (firmware 1.7 and 1.11, ADR 0009): the IMU sits rotated a quarter
 * turn about the camera's lateral axis, so the body's down is the IMU's z and the body's forward
 * is the IMU's minus y. Chosen by the world-stillness ranking in
 * `tools/integration/src/browser/imuMappingRanking.test.ts`, which every other arrangement loses.
 */
export const X5_IMU_FRAME = measuredImuFrame('X5', ['x', 'z', '-y']);

/**
 * Until a recording proves otherwise, the IMU is assumed aligned with the body.
 */
export const ALIGNED_IMU_FRAME = assumedImuFrame('aligned (unverified)', ['x', 'y', 'z']);

/**
 * What the info record says about the camera, as far as the IMU frame depends on it.
 */
export interface ImuFrameHints {
  readonly model: string | undefined;
}

const IMU_FRAMES_BY_MODEL: readonly (readonly [modelPrefix: string, frame: ImuFrame])[] = [
  ['Insta360 X5', X5_IMU_FRAME],
];

/**
 * The IMU frame for a recording, chosen from the camera model the file names. A starting point
 * the recording's own data can be checked against with the ranking test, never the last word.
 */
export function imuFrameFor(hints: ImuFrameHints): ImuFrame {
  const match = IMU_FRAMES_BY_MODEL.find(([prefix]) => hints.model?.startsWith(prefix));
  return match?.[1] ?? ALIGNED_IMU_FRAME;
}
