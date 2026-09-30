import { ThreeFrameRenderer, type ThreeFrameRendererOptions } from '@gyroview/adapter-three';
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
import { shownAsRecorded } from '@gyroview/core/testing';
import type { OpenedRecording } from '@gyroview/player/composition';

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A renderer drawing a sample as an equirectangular panorama, and the canvas it draws on.
 */
export interface EquirectangularRendering<
  Renderer extends ThreeFrameRenderer = ThreeFrameRenderer,
> {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: Renderer;
  readonly dispose: () => void;
}

/**
 * How a kind of renderer is made on a canvas: the player's, or the lab's.
 */
export type RendererMaker<Renderer extends ThreeFrameRenderer> = (
  canvas: HTMLCanvasElement,
  setup: StitchingSetup,
  options: ThreeFrameRendererOptions,
) => Renderer;

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
 * The sample stitched by the player's renderer into a panorama on a canvas of `size`, its pixels
 * kept for reading back.
 */
export function equirectangularRendering(
  opened: OpenedRecording,
  size: CanvasSize,
): EquirectangularRendering {
  const make: RendererMaker<ThreeFrameRenderer> = (canvas, setup, options) =>
    ThreeFrameRenderer.create(canvas, setup, options);
  return renderingWith(make, { setup: setupOf(opened), size });
}

/**
 * The player's picture of the sample: its calibration, layout and display conversions.
 */
export function setupOf(opened: OpenedRecording): StitchingSetup {
  return buildStitchingSetup({
    calibration: calibrationOf(opened),
    layout: opened.layout,
    displayConversions: opened.displayConversions,
  });
}

/**
 * The sample drawn as recorded, in its own signal: what a Studio export of that signal (HLG on
 * the X6) is compared with, so that colour stays out of the geometry.
 */
export function recordedSetupOf(opened: OpenedRecording): StitchingSetup {
  return buildStitchingSetup({
    calibration: calibrationOf(opened),
    layout: opened.layout,
    displayConversions: shownAsRecorded(opened.layout),
  });
}

/**
 * A panorama of the setup drawn by the kind of renderer `make` makes.
 */
export function renderingWith<Renderer extends ThreeFrameRenderer>(
  make: RendererMaker<Renderer>,
  drawn: { readonly setup: StitchingSetup; readonly size: CanvasSize },
): EquirectangularRendering<Renderer> {
  const canvas = document.createElement('canvas');
  canvas.width = drawn.size.width;
  canvas.height = drawn.size.height;
  const renderer = make(canvas, drawn.setup, { preserveDrawingBuffer: true });
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
