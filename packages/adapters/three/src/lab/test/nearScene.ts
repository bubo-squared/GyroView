import {
  clamp,
  degrees,
  degreesToRadians,
  radians,
  radiansToDegrees,
  type CalibrationSet,
  type Degrees,
  type DecodedFrame,
  type StitchingSetup,
  type Vector3,
} from '@gyroview/core';

import { recordedFrame, type Scene } from '../../test/recordedFrames';

/**
 * A luma that varies 24 times around the ring and falls across it, so a slide across the ring
 * shows everywhere along it.
 */
const RING_CYCLES = 24;
const RING_AMPLITUDE = 0.2;
const TILT_PER_UNIT_Z = 1.9;
const MIDDLE = 0.5;

export function ringScene([x, y, z]: Vector3): number {
  const around = RING_AMPLITUDE * Math.sin(RING_CYCLES * Math.atan2(y, x));
  return clamp(MIDDLE + around + TILT_PER_UNIT_Z * z, 0, 1);
}

/**
 * The body direction `theta` from body +z at `azimuth` from +x towards +y.
 */
export function directionAt(theta: Degrees, azimuth: Degrees): Vector3 {
  const t = degreesToRadians(theta);
  const a = degreesToRadians(azimuth);
  return [Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), Math.cos(t)];
}

/**
 * A disparity for each azimuth.
 */
export type DisparityProfile = (azimuth: Degrees) => Degrees;

/**
 * The scene as a lens sees it that sees everything `by(azimuth)` degrees farther from body +z
 * than it is: what it records in a direction is what lies that much nearer the axis.
 */
function displacedAcross(scene: Scene, by: DisparityProfile): Scene {
  return ([x, y, z]) => {
    const azimuth = Math.atan2(y, x);
    const azimuthInDegrees = radiansToDegrees(radians(azimuth));
    const displacement = degreesToRadians(by(azimuthInDegrees));
    const theta = Math.atan2(Math.hypot(x, y), z) - displacement;
    return scene([
      Math.sin(theta) * Math.cos(azimuth),
      Math.sin(theta) * Math.sin(azimuth),
      Math.cos(theta),
    ]);
  };
}

export interface NearScene {
  readonly calibration: CalibrationSet;
  readonly setup: StitchingSetup;
  /**
   * How far apart the two lenses' images of the ring scene lie at each azimuth.
   */
  readonly disparity: DisparityProfile;
  /**
   * How bright the back lens records the scene against the front one.
   */
  readonly backBrightness?: number;
}

/**
 * Both lenses recording the ring scene near the camera, each seeing it half the disparity
 * farther from its own axis than an infinitely far scene.
 */
export function nearScenePair(near: NearScene): DecodedFrame<VideoFrame>[] {
  const { calibration, setup, disparity, backBrightness = 1 } = near;
  return calibration.lenses.map((lens, index) => {
    const stitch = setup.lenses[index];
    if (!stitch) throw new Error(`no lens ${index} in the setup`);
    const side = index === 0 ? 1 : -1;
    const brightness = index === 0 ? 1 : backBrightness;
    const seen = displacedAcross(ringScene, (azimuth) => degrees((side * disparity(azimuth)) / 2));
    return recordedFrame({
      lens,
      calibration,
      bodyToLens: stitch.rotation,
      scene: (direction) => brightness * seen(direction),
    });
  });
}
