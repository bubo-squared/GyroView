import type { StabilizationMode, Stabilizer } from './Stabilizer';
import { IDENTITY_MATRIX3, multiplyMatrices, type Matrix3 } from '../../../shared/math/Matrix3';
import {
  conjugateQuaternion,
  quaternionFromAxisAngle,
  quaternionToMatrix,
  slerpQuaternions,
  type Quaternion,
} from '../../../shared/math/Quaternion';
import { radians, type Radians } from '../../../shared/units/angle';
import { seconds, type Seconds } from '../../../shared/units/time';
import { WORLD_DOWN } from '../orientation/gravity';

/**
 * The picture moves with the camera, as recorded.
 */
export class OffStabilization implements Stabilizer {
  public rotationFor(): Matrix3 {
    return IDENTITY_MATRIX3;
  }
}

/**
 * The view is fixed to the world: camera motion disappears entirely.
 */
export class LockStabilization implements Stabilizer {
  public rotationFor(orientation: Quaternion): Matrix3 {
    return quaternionToMatrix(conjugateQuaternion(orientation));
  }
}

/**
 * The horizon stays level but the view turns with the camera's heading.
 */
export class HorizonStabilization implements Stabilizer {
  public rotationFor(orientation: Quaternion): Matrix3 {
    const heading = quaternionFromAxisAngle(WORLD_DOWN, headingOf(orientation));
    return multiplyMatrices(
      quaternionToMatrix(conjugateQuaternion(orientation)),
      quaternionToMatrix(heading),
    );
  }
}

export interface FollowOptions {
  /**
   * How long the view takes to catch up with a new camera direction (the low-pass time constant).
   */
  readonly timeConstant: Seconds;
  /**
   * A jump in video time larger than this (a seek) restarts the smoothing at the camera's pose.
   */
  readonly maxContinuousGap: Seconds;
}

const DEFAULT_TIME_CONSTANT_SECONDS = 1.5;
const DEFAULT_MAX_GAP_SECONDS = 1;

const DEFAULT_FOLLOW_OPTIONS: FollowOptions = {
  timeConstant: seconds(DEFAULT_TIME_CONSTANT_SECONDS),
  maxContinuousGap: seconds(DEFAULT_MAX_GAP_SECONDS),
};

/**
 * The view follows the camera's direction smoothly, removing shake but not intended motion.
 */
export class FollowStabilization implements Stabilizer {
  private smoothed: Quaternion | undefined;
  private previousTime: Seconds | undefined;

  public constructor(private readonly options: FollowOptions = DEFAULT_FOLLOW_OPTIONS) {}

  public rotationFor(orientation: Quaternion, videoTime: Seconds): Matrix3 {
    this.smoothed = this.follow(orientation, videoTime);
    this.previousTime = videoTime;
    return multiplyMatrices(
      quaternionToMatrix(conjugateQuaternion(orientation)),
      quaternionToMatrix(this.smoothed),
    );
  }

  /**
   * A seek (a jump either way beyond the continuous gap) restarts on the camera; a small step
   * back (frame jitter) holds; ordinary forward time low-passes towards the camera.
   */
  private follow(orientation: Quaternion, videoTime: Seconds): Quaternion {
    const gap = this.previousTime === undefined ? Infinity : videoTime - this.previousTime;
    if (!this.smoothed || Math.abs(gap) > this.options.maxContinuousGap) return orientation;
    if (gap <= 0) return this.smoothed;
    const weight = 1 - Math.exp(-gap / this.options.timeConstant);
    return slerpQuaternions(this.smoothed, orientation, weight);
  }
}

const STABILIZERS: Readonly<Record<StabilizationMode, () => Stabilizer>> = {
  off: () => new OffStabilization(),
  lock: () => new LockStabilization(),
  horizon: () => new HorizonStabilization(),
  follow: () => new FollowStabilization(),
};

/**
 * A fresh strategy for the mode; stateful ones start from nothing.
 */
export function stabilizerFor(mode: StabilizationMode): Stabilizer {
  return STABILIZERS[mode]();
}

/**
 * The camera's heading: the twist of its orientation about the world's vertical axis (the
 * swing-twist decomposition). Unlike the yaw of the forward axis, it stays continuous when the
 * camera points straight up or down; it is undefined only for an exact half turn about a
 * horizontal axis, where it reads zero.
 */
function headingOf(orientation: Quaternion): Radians {
  const [, y, , w] = orientation;
  return radians(2 * Math.atan2(y, w));
}
