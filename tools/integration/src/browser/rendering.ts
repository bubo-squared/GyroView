import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  buildStitchingSetup,
  type CalibrationSet,
  type MotionSetup,
  type StitchingSetup,
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
  readonly renderer: ThreeFrameRenderer;
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
 * The sample stitched into a panorama on a canvas of `size`, its pixels kept for reading back.
 */
export function equirectangularRendering(
  opened: OpenedRecording,
  size: CanvasSize,
): EquirectangularRendering {
  const setup = buildStitchingSetup({ calibration: calibrationOf(opened), layout: opened.layout });
  return equirectangularRenderingOf(setup, size);
}

/**
 * As {@link equirectangularRendering}, for a stitching setup of the caller's own: another
 * reading of the calibration, or a scaled one.
 */
export function equirectangularRenderingOf(
  setup: StitchingSetup,
  size: CanvasSize,
): EquirectangularRendering {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
  renderer.setViewMode('equirectangular');
  return {
    canvas,
    renderer,
    dispose: (): void => {
      renderer.dispose();
    },
  };
}
