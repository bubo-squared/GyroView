import type { StabilizableFrameSink } from './FrameSink';
import type { SeamMeter } from './SeamMeter';
import type { ViewMode } from '../domain/view/ViewMode';
import type { ViewState } from '../domain/view/ViewState';
import type { Vector3 } from '../shared/math/Vector3';

/**
 * Port: what a player needs of a renderer. It draws each presented pair as the picture the view
 * and the view mode ask for, turned by the stabilization and scaled by the lens gains, on a
 * surface of a given size, and can measure the seam of what it draws.
 */
export interface PictureRenderer<Handle = unknown> extends StabilizableFrameSink<Handle> {
  setView(view: ViewState): void;
  setViewMode(mode: ViewMode): void;
  /**
   * Matches the drawing buffer to a new surface size, in device pixels.
   */
  resize(width: number, height: number): void;
  /**
   * A meter over the seam of the pictures this renderer draws; whoever creates it disposes it,
   * before the renderer.
   */
  createSeamMeter(): SeamMeter;
  /**
   * Per-channel multipliers, one per lens in lens order: exposure matching, or silencing a lens
   * to inspect the other.
   */
  setLensGains(gains: readonly Vector3[]): void;
  dispose(): void;
}
