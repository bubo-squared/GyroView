import {
  buildStitchingSetup,
  degrees,
  degreesToRadians,
  FULL_FRAME,
  LEFT_HALF,
  RIGHT_HALF,
  type CalibrationSet,
  type LensLayout,
  type LensModel,
  type MeiDistortion,
  type StitchingSetup,
} from '@gyroview/core';
import {
  EquidistantModel,
  MeiModel,
  RADIUS_AS_READ,
  shownAsRecorded,
} from '@gyroview/core/testing';

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
  return backToBack(
    (principalPoint) =>
      new EquidistantModel({
        edgeRadius: HALF_SQUARE,
        radiusAngle: degreesToRadians(degrees(EDGE_DEGREES)),
        principalPoint,
      }),
  );
}

/**
 * The X5's `xi`, and a focal length that keeps the field edge inside the square.
 */
const MEI_XI = 2;
const MEI_FOCAL = 800;

/**
 * Two Mei lenses of the distortion given, back to back like {@link syntheticCalibration}.
 */
export function syntheticMeiCalibration(distortion: MeiDistortion): CalibrationSet {
  return backToBack(
    (principalPoint) =>
      new MeiModel({ xi: MEI_XI, focal: [MEI_FOCAL, MEI_FOCAL], principalPoint, distortion }),
  );
}

function backToBack(
  modelAt: (principalPoint: { readonly x: number; readonly y: number }) => LensModel,
): CalibrationSet {
  const lens = (lensIndex: number): CalibrationSet['lenses'][number] => ({
    lensIndex,
    model: modelAt({ x: lensIndex * SQUARE + HALF_SQUARE, y: HALF_SQUARE }),
    orientation: { yaw: degrees(0), pitch: degrees(0), roll: degrees(0) },
    translation: [0, 0, 0],
  });
  return {
    canvas: { width: 2 * SQUARE, height: SQUARE },
    lenses: [lens(0), lens(1)],
    radialScale: RADIUS_AS_READ,
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

/**
 * The setup of `calibration` on `layout`, every lens shown as recorded: the synthetic lenses by
 * default.
 */
export function setupAsRecorded(
  layout: LensLayout,
  calibration: CalibrationSet = syntheticCalibration(),
): StitchingSetup {
  return buildStitchingSetup({ calibration, layout, displayConversions: shownAsRecorded(layout) });
}
