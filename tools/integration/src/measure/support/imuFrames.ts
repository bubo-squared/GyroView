import {
  assumedImuFrame,
  isProperRotation,
  type BodyAxes,
  type ImuFrame,
  type SignedAxis,
} from '@gyroview/core';

const AXES: readonly SignedAxis[] = ['x', 'y', 'z', '-x', '-y', '-z'];

/**
 * Every proper rotation that permutes and flips axes: the 24 ways an IMU can sit in a camera.
 */
export function allImuFrames(): readonly ImuFrame[] {
  return AXES.flatMap((x) => AXES.flatMap((y) => AXES.flatMap((z) => properFrameOf(x, y, z))));
}

function properFrameOf(x: SignedAxis, y: SignedAxis, z: SignedAxis): ImuFrame[] {
  const axes: BodyAxes = [x, y, z];
  return isProperRotation(axes) ? [assumedImuFrame(axes.join(','), axes)] : [];
}

/**
 * The name `allImuFrames` gives the arrangement of `frame`.
 */
export function rankedNameOf(frame: ImuFrame): string | undefined {
  return allImuFrames().find((candidate) => candidate.toBody.join(',') === frame.toBody.join(','))
    ?.name;
}
