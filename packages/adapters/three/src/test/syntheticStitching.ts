import {
  degrees,
  degreesToRadians,
  EquidistantModel,
  FULL_FRAME,
  LEFT_HALF,
  RIGHT_HALF,
  type CalibrationSet,
  type LensLayout,
} from '@gyroview/core';

const SQUARE = 1000;
const HALF_SQUARE = 500;
/**
 * Ideal 200-degree lenses: the edge radius marks the 100-degree field edge itself.
 */
const EDGE_DEGREES = 100;

/**
 * Two ideal 200-degree lenses back to back on a canvas of two squares, no pose corrections.
 */
export function syntheticCalibration(): CalibrationSet {
  const lens = (lensIndex: number): CalibrationSet['lenses'][number] => ({
    lensIndex,
    model: new EquidistantModel({
      edgeRadius: HALF_SQUARE,
      radiusAngle: degreesToRadians(degrees(EDGE_DEGREES)),
      principalPoint: { x: lensIndex * SQUARE + HALF_SQUARE, y: HALF_SQUARE },
    }),
    orientation: { yaw: degrees(0), pitch: degrees(0), roll: degrees(0) },
    translation: [0, 0, 0],
  });
  return {
    canvas: { width: 2 * SQUARE, height: SQUARE },
    lenses: [lens(0), lens(1)],
  };
}

export const MULTI_TRACK: LensLayout = {
  kind: 'multi-track',
  sources: [
    { lensIndex: 0, inputIndex: 0, trackIndex: 0, region: FULL_FRAME },
    { lensIndex: 1, inputIndex: 0, trackIndex: 1, region: FULL_FRAME },
  ],
  evidence: [],
};

export const PACKED: LensLayout = {
  kind: 'packed',
  sources: [
    { lensIndex: 0, inputIndex: 0, trackIndex: 0, region: LEFT_HALF },
    { lensIndex: 1, inputIndex: 0, trackIndex: 0, region: RIGHT_HALF },
  ],
  evidence: [],
};
