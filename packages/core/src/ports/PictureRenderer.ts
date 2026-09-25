import type { StabilizableFrameSink } from './FrameSink';
import type { ViewMode } from '../domain/view/ViewMode';
import type { ViewState } from '../domain/view/ViewState';

/**
 * Port: what a player needs of a renderer. It draws each presented pair as the picture the view
 * and the view mode ask for, turned by the stabilization, on a surface of a given size, and can
 * match the lenses' exposure along the seam while frames arrive.
 */
export interface PictureRenderer<Handle = unknown> extends StabilizableFrameSink<Handle> {
  setView(view: ViewState): void;
  setViewMode(mode: ViewMode): void;
  /**
   * Matches the drawing buffer to a new surface size, in device pixels.
   */
  resize(width: number, height: number): void;
  enableGainMatching(): void;
  /**
   * Stops measuring; the last gains stay in place.
   */
  disableGainMatching(): void;
  dispose(): void;
}
