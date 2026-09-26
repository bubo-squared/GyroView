import {
  clampView,
  DEFAULT_VIEW,
  DEFAULT_VIEW_MODE,
  isSameView,
  lookAt,
  viewModeRulesFor,
  type Degrees,
  type DragDelta,
  type PictureRenderer,
  type TypedEmitter,
  type ViewMode,
  type ViewModeRules,
  type ViewState,
} from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';

/**
 * The part of the renderer the view drives.
 */
export type ViewSurface = Pick<PictureRenderer, 'setView' | 'setViewMode'>;

/**
 * Where the viewer looks and how the picture shows it: kept across loads, drawn by whichever
 * renderer is attached, and announced when it changes. The viewer's gestures go through the
 * mode's rules; a host setting the view directly is obeyed as it is.
 */
export class PlayerView {
  private state: ViewState = DEFAULT_VIEW;
  private mode: ViewMode = DEFAULT_VIEW_MODE;
  private surface: ViewSurface | undefined;

  public constructor(private readonly events: TypedEmitter<PlayerEvents>) {}

  public get current(): ViewState {
    return this.state;
  }

  public get viewMode(): ViewMode {
    return this.mode;
  }

  /**
   * The renderer of the loaded recording, or nothing between loads. A new renderer draws the view
   * as it is now, however it changed while the recording was loading.
   */
  public attach(surface: ViewSurface | undefined): void {
    this.surface = surface;
    surface?.setViewMode(this.mode);
    surface?.setView(this.state);
  }

  public set(view: ViewState): void {
    const next = clampView(view);
    if (isSameView(next, this.state)) return;
    this.state = next;
    this.surface?.setView(this.state);
    this.events.emit('viewchange', this.state);
  }

  public setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.surface?.setViewMode(mode);
    this.events.emit('viewmodechange', mode);
  }

  public lookAt(yaw: Degrees, pitch: Degrees): void {
    this.set(lookAt(this.state, yaw, pitch));
  }

  public pan(delta: DragDelta, viewportWidth: number): void {
    this.set(this.rules().pan(this.state, delta, viewportWidth));
  }

  public turn(yawDelta: Degrees, pitchDelta: Degrees): void {
    this.set(this.rules().turn(this.state, yawDelta, pitchDelta));
  }

  public zoom(steps: number): void {
    this.set(this.rules().zoom(this.state, steps));
  }

  public reset(): void {
    this.set(DEFAULT_VIEW);
  }

  private rules(): ViewModeRules {
    return viewModeRulesFor(this.mode);
  }
}
