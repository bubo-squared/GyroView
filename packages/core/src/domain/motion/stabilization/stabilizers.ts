import type { StabilizationMode, Stabilizer } from './Stabilizer';
import { IDENTITY_MATRIX3, multiplyMatrices, type Matrix3 } from '../../../shared/math/Matrix3';
import {
  conjugateQuaternion,
  quaternionFromAxisAngle,
  quaternionToMatrix,
  rotateVector,
  slerpQuaternions,
  type Quaternion,
} from '../../../shared/math/Quaternion';
import type { Vector3 } from '../../../shared/math/Vector3';
import { radians, type Radians } from '../../../shared/units/angle';
import { seconds, type Seconds } from '../../../shared/units/time';

const WORLD_VERTICAL_AXIS: Vector3 = [0, 1, 0];
const BODY_FORWARD: Vector3 = [0, 0, 1];

/**
 * The picture moves with the camera, as recorded.
 */
export class OffStabilization implements Stabilizer {
  public readonly mode = 'off';

  public rotationFor(): Matrix3 {
    return IDENTITY_MATRIX3;
  }
}

/**
 * The view is fixed to the world: camera motion disappears entirely.
 */
export class LockStabilization implements Stabilizer {
  public readonly mode = 'lock';

  public rotationFor(orientation: Quaternion): Matrix3 {
    return quaternionToMatrix(conjugateQuaternion(orientation));
  }
}

/**
 * The horizon stays level but the view turns with the camera's heading.
 */
export class HorizonStabilization implements Stabilizer {
  public readonly mode = 'horizon';

  public rotationFor(orientation: Quaternion): Matrix3 {
    const heading = quaternionFromAxisAngle(WORLD_VERTICAL_AXIS, headingOf(orientation));
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
  public readonly mode = 'follow';
  private smoothed: Quaternion | undefined;
  private previousTime: Seconds | undefined;

  public constructor(private readonly options: FollowOptions = DEFAULT_FOLLOW_OPTIONS) {}

  public rotationFor(orientation: Quaternion, videoTime: Seconds): Matrix3 {
    const gap = this.previousTime === undefined ? Infinity : videoTime - this.previousTime;
    const isContinuous = gap >= 0 && gap <= this.options.maxContinuousGap;
    const weight = 1 - Math.exp(-gap / this.options.timeConstant);
    this.smoothed =
      isContinuous && this.smoothed
        ? slerpQuaternions(this.smoothed, orientation, weight)
        : orientation;
    this.previousTime = videoTime;
    return multiplyMatrices(
      quaternionToMatrix(conjugateQuaternion(orientation)),
      quaternionToMatrix(this.smoothed),
    );
  }
}

export function stabilizerFor(mode: StabilizationMode): Stabilizer {
  switch (mode) {
    case 'off': {
      return new OffStabilization();
    }
    case 'lock': {
      return new LockStabilization();
    }
    case 'horizon': {
      return new HorizonStabilization();
    }
    case 'follow': {
      return new FollowStabilization();
    }
  }
}

/**
 * The camera's heading: the yaw of its forward axis projected onto the world's horizontal plane.
 */
function headingOf(orientation: Quaternion): Radians {
  const forward = rotateVector(orientation, BODY_FORWARD);
  return radians(Math.atan2(forward[0], forward[2]));
}
