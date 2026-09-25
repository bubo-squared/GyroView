import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  clampView,
  DEFAULT_VIEW,
  lookAt,
  zoomView,
  type Degrees,
  type ViewState,
} from '@gyroview/core';

/**
 * The part of the renderer the view drives.
 */
export type ViewSurface = Pick<ThreeFrameRenderer, 'setView'>;

/**
 * Where the viewer looks: kept across loads, drawn by whichever renderer is attached, and
 * announced on every change.
 */
export class PlayerView {
  private state: ViewState = DEFAULT_VIEW;
  private surface: ViewSurface | undefined;

  public constructor(private readonly onChange: (view: ViewState) => void) {}

  public get current(): ViewState {
    return this.state;
  }

  /**
   * The view the next load starts from. Not announced: nothing shows it yet.
   */
  public restore(view: ViewState): void {
    this.state = clampView(view);
  }

  /**
   * The renderer of the loaded recording, or nothing between loads.
   */
  public attach(surface: ViewSurface | undefined): void {
    this.surface = surface;
  }

  public set(view: ViewState): void {
    this.state = clampView(view);
    this.surface?.setView(this.state);
    this.onChange(this.state);
  }

  public lookAt(yaw: Degrees, pitch: Degrees): void {
    this.set(lookAt(this.state, yaw, pitch));
  }

  public zoom(steps: number): void {
    this.set(zoomView(this.state, steps));
  }

  public reset(): void {
    this.set({ ...DEFAULT_VIEW, projection: this.state.projection });
  }
}
