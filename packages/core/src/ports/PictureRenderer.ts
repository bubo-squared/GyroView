import type { FrameSink } from './FrameSink';
import type { SeamMeter } from './SeamMeter';
import type { ViewMode } from '../domain/view/ViewMode';
import type { ViewState } from '../domain/view/ViewState';
import type { Matrix3 } from '../shared/math/Matrix3';
import type { Vector3 } from '../shared/math/Vector3';

/**
 * Port: what a player needs of a renderer. It draws each presented pair as the picture the view
 * and the view mode ask for, turned by the stabilization and scaled by the lens gains, on a
 * surface of a given size, and can measure the seam of what it draws.
 */
export interface PictureRenderer<Handle = unknown> extends FrameSink<Handle> {
  /**
   * Turns the whole picture: `rotation` takes directions from the stabilized reference frame the
   * viewer looks around in into the camera body frame, and is applied after the view rotation
   * and before the lens poses. Takes effect with the next presentation.
   */
  setStabilization(rotation: Matrix3): void;
  setView(view: ViewState): void;
  setViewMode(mode: ViewMode): void;
  /**
   * Matches the drawing buffer to a new surface size, in device pixels.
   */
  resize(width: number, height: number): void;
  /**
   * A meter over the seam of the pictures this renderer draws. Whoever creates it disposes it;
   * the renderer disposes any still live when it is disposed itself.
   */
  createSeamMeter(): SeamMeter;
  /**
   * Per-channel multipliers, one per lens in lens order: exposure matching, or silencing a lens
   * to inspect the other.
   */
  setLensGains(gains: readonly Vector3[]): void;
  dispose(): void;
}
