import { LabRenderer } from '@gyroview/adapter-three/lab';
import type { StitchingSetup } from '@gyroview/core';
import type { OpenedRecording } from '@gyroview/player/composition';

import {
  renderingWith,
  setupOf,
  type CanvasSize,
  type EquirectangularRendering,
  type RendererMaker,
} from '../../browser/rendering';

const makeLabRenderer: RendererMaker<LabRenderer> = (canvas, setup, options) =>
  LabRenderer.create(canvas, setup, options);

/**
 * The sample stitched by the lab's renderer, which the measurements turn and read: the player's
 * picture, with a lens pose to set, the seam join and the mismatch meter.
 */
export function labRendering(
  opened: OpenedRecording,
  size: CanvasSize,
): EquirectangularRendering<LabRenderer> {
  return labRenderingOfSetup(setupOf(opened), size);
}

/**
 * As {@link labRendering}, for a stitching setup of the caller's own: another reading of the
 * calibration, or a scaled one.
 */
export function labRenderingOfSetup(
  setup: StitchingSetup,
  size: CanvasSize,
): EquirectangularRendering<LabRenderer> {
  return renderingWith(makeLabRenderer, { setup, size });
}
