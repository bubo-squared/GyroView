import { LabRenderer } from '@gyroview/adapter-three/lab';
import {
  buildStitchingSetup,
  degreesToRadians,
  HALF_TURN,
  QUARTER_TURN,
  stabilizerFor,
  type CalibrationSet,
  type FramePair,
  type Matrix3,
  type MotionSetup,
  type StitchingSetup,
  type Vector3,
} from '@gyroview/core';
import type { OpenedRecording } from '@gyroview/player/composition';

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A renderer drawing a sample as an equirectangular panorama, and the canvas it draws on.
 */
export interface EquirectangularRendering {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: LabRenderer;
  readonly dispose: () => void;
}

export function calibrationOf(opened: OpenedRecording): CalibrationSet {
  const { calibration } = opened.recording.calibration;
  if (!calibration) throw new Error('the recording carries no calibration');
  return calibration;
}

export function motionOf(opened: OpenedRecording): MotionSetup {
  if (!opened.motion) throw new Error('the recording carries no gyro record');
  return opened.motion;
}

/**
 * The gyro's lock stabilization of the pair: the stabilized frame into the body.
 */
export function lockOf(opened: OpenedRecording, pair: FramePair<VideoFrame>): Matrix3 {
  return stabilizerFor('lock').nextRotation(
    motionOf(opened).orientations.orientationAt(pair.timestamp),
    pair.timestamp,
  );
}

/**
 * The sample stitched into a panorama on a canvas of `size`, its pixels kept for reading back.
 */
export function equirectangularRendering(
  opened: OpenedRecording,
  size: CanvasSize,
): EquirectangularRendering {
  const setup = buildStitchingSetup({ calibration: calibrationOf(opened), layout: opened.layout });
  return renderingOfSetup(setup, size);
}

/**
 * As {@link equirectangularRendering}, for a stitching setup of the caller's own: another
 * reading of the calibration, or a scaled one.
 */
export function renderingOfSetup(
  setup: StitchingSetup,
  size: CanvasSize,
): EquirectangularRendering {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const renderer = LabRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
  renderer.setViewMode('equirectangular');
  return {
    canvas,
    renderer,
    dispose: (): void => {
      renderer.dispose();
    },
  };
}

const SILENT: Vector3 = [0, 0, 0];

/**
 * The gains that draw only `lensIndex`, at its own gain: the others silenced, it fills its
 * whole field up to where its feather ends, and every other pixel is black.
 */
export function gainsShowingOnly(gains: readonly Vector3[], lensIndex: number): Vector3[] {
  return gains.map((gain, index) => (index === lensIndex ? gain : SILENT));
}

const PIXEL_CENTRE = 0.5;
const HALF_TURN_RADIANS = degreesToRadians(HALF_TURN);
const QUARTER_TURN_RADIANS = degreesToRadians(QUARTER_TURN);

/**
 * The direction seen through the centre of a pixel of the panorama, counted from the top-left,
 * in the view frame: the inverse of the stitching shader's ray.
 */
export function viewDirectionOf(column: number, row: number, size: CanvasSize): Vector3 {
  const yaw = ((column + PIXEL_CENTRE) / size.width) * 2 * HALF_TURN_RADIANS - HALF_TURN_RADIANS;
  const pitch = -(((row + PIXEL_CENTRE) / size.height) * 2 - 1) * QUARTER_TURN_RADIANS;
  return [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}
