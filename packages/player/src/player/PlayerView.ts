import {
  clampView,
  DEFAULT_FRAMING,
  DEFAULT_VIEW_MODE,
  isSameFraming,
  isSameView,
  lookAt,
  SCREEN_CENTRE,
  viewModeRulesFor,
  type Degrees,
  type DragDelta,
  type Framing,
  type PictureRenderer,
  type ScreenPoint,
  type TypedEmitter,
  type ViewContext,
  type ViewMode,
  type ViewModeRules,
  type ViewportSize,
  type ViewState,
} from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';

/**
 * The part of the renderer the view drives.
 */
export type ViewSurface = Pick<PictureRenderer, 'setFraming' | 'setViewMode'>;

/**
 * Every layout the player accepts has two lenses; a loaded recording says so itself.
 */
const LENS_COUNT_BEFORE_A_LOAD = 2;

/**
 * How the picture is framed and which view mode shows it: kept across loads, drawn by whichever
 * renderer is attached, and the normal view announced when it changes. The viewer's gestures go
 * through the mode's rules on the viewport as it is now; a host setting the view directly is
 * obeyed as it is.
 */
export class PlayerView {
  private framing: Framing = DEFAULT_FRAMING;
  private mode: ViewMode = DEFAULT_VIEW_MODE;
  private surface: ViewSurface | undefined;
  private lensCount = LENS_COUNT_BEFORE_A_LOAD;

  public constructor(
    private readonly events: TypedEmitter<PlayerEvents>,
    private readonly viewportSize: () => ViewportSize,
  ) {}

  public get current(): ViewState {
    return this.framing.view;
  }

  public get viewMode(): ViewMode {
    return this.mode;
  }

  /**
   * Whether a drag moves the picture as it is framed now.
   */
  public get canPan(): boolean {
    return this.rules().canPan(this.framing);
  }

  /**
   * The renderer of the loaded recording and its lens count, or nothing between loads. A new
   * renderer draws the framing as it is now, however it changed while the recording was loading.
   */
  public attach(surface: ViewSurface | undefined, lensCount = this.lensCount): void {
    this.surface = surface;
    this.lensCount = lensCount;
    surface?.setViewMode(this.mode);
    surface?.setFraming(this.framing);
  }

  public set(view: ViewState): void {
    this.frame({ ...this.framing, view: clampView(view) });
  }

  public setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.surface?.setViewMode(mode);
    this.events.emit('viewmodechange', mode);
  }

  public lookAt(yaw: Degrees, pitch: Degrees): void {
    this.frame({ ...this.framing, view: lookAt(this.framing.view, yaw, pitch) });
  }

  public pan(delta: DragDelta): void {
    this.frame(this.rules().pan(this.framing, delta, this.context()));
  }

  public turn(yaw: Degrees, pitch: Degrees): void {
    this.frame(this.rules().turn(this.framing, { yaw, pitch }, this.context()));
  }

  /**
   * Zooms by `steps`, keeping the point of the viewport at `focus` on what it shows.
   */
  public zoom(steps: number, focus: ScreenPoint = SCREEN_CENTRE): void {
    this.frame(this.rules().zoom(this.framing, { steps, focus }, this.context()));
  }

  /**
   * Back to how the current mode starts; the other modes keep their framing.
   */
  public reset(): void {
    this.frame(this.rules().reset(this.framing));
  }

  private frame(next: Framing): void {
    if (isSameFraming(next, this.framing)) return;
    const hasViewChanged = !isSameView(next.view, this.framing.view);
    this.framing = next;
    this.surface?.setFraming(next);
    if (hasViewChanged) this.events.emit('viewchange', next.view);
  }

  private context(): ViewContext {
    return { viewport: this.viewportSize(), lensCount: this.lensCount };
  }

  private rules(): ViewModeRules {
    return viewModeRulesFor(this.mode);
  }
}
