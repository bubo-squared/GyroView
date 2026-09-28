import {
  transformVector,
  transposeMatrix,
  type CalibrationSet,
  type DecodedFrame,
  type LensCalibration,
  type Matrix3,
  type Vector3,
} from '@gyroview/core';

import { paintedFrame } from './syntheticFrames';

export const RECORDED_FRAME_SIZE = 256;

/**
 * A scene's luma (0..1) in each body direction.
 */
export type Scene = (direction: Vector3) => number;

export interface Recording {
  readonly lens: LensCalibration;
  readonly calibration: CalibrationSet;
  readonly bodyToLens: Matrix3;
  readonly scene: Scene;
}

/**
 * What an ideal equidistant lens with the given body-to-lens rotation records of the scene:
 * each frame pixel is mapped back through the lens to its body direction.
 */
export function recordedFrame({
  lens,
  calibration,
  bodyToLens,
  scene,
}: Recording): DecodedFrame<VideoFrame> {
  const lensToBody = transposeMatrix(bodyToLens);
  const side = calibration.canvas.height;
  const squareX = Math.floor(lens.model.principalPoint.x / side) * side;
  const { principalPoint, halfFieldOfView } = lens.model;
  const rim = lens.model.project([Math.sin(halfFieldOfView), 0, Math.cos(halfFieldOfView)]);
  if (!rim) throw new Error('the lens images its own rim');
  const edgeRadius = rim.x - principalPoint.x;
  return paintedFrame(RECORDED_FRAME_SIZE, (column, row) => {
    const dx = squareX + ((column + 0.5) / RECORDED_FRAME_SIZE) * side - principalPoint.x;
    const dy = ((row + 0.5) / RECORDED_FRAME_SIZE) * side - principalPoint.y;
    const radius = Math.hypot(dx, dy);
    const theta = (radius / edgeRadius) * halfFieldOfView;
    if (theta > halfFieldOfView) return 0;
    const lateral = radius > 0 ? [dx / radius, dy / radius] : [0, 0];
    const inLens: Vector3 = [
      Math.sin(theta) * (lateral[0] ?? 0),
      Math.sin(theta) * (lateral[1] ?? 0),
      Math.cos(theta),
    ];
    return scene(transformVector(lensToBody, inLens));
  });
}
