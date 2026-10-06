import {
  DEFAULT_FRAMING,
  DEFAULT_VIEW_MODE,
  followReading,
  isSameFraming,
  lookAt,
  motionLookRulesFor,
  SCREEN_CENTRE,
  viewModeRulesFor,
  withoutRoll,
  type Degrees,
  type DeviceReading,
  type DragDelta,
  type Framing,
  type PictureRenderer,
  type ScreenPoint,
  type EventSink,
  type ViewContext,
  type ViewMode,
  type ViewGestureRules,
  type ViewportSize,
  type ViewState,
} from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';
import { anglesOf, isSameAngles } from './viewAngles';

/**
 * The part of the renderer the view drives, and how many lenses it draws in the lens tiles.
 */
export type ViewSurface = Pick<PictureRenderer, 'setFraming' | 'setViewMode' | 'lensCount'>;

/**
 * Every layout the player accepts has two lenses; a renderer attached says so itself.
 */
const LENS_COUNT_BEFORE_A_LOAD = 2;

/**
 * How the picture is framed and which view mode shows it: kept across loads, drawn by whichever
 * renderer is attached, and the normal view's angles announced when they change. The viewer's
 * gestures and a host setting the view go through the mode's rules on the viewport as it is
 * now; while the device holds the view (motion look, ADR 0040), through the rules it follows
 * then.
 */
export class PlayerView {
  private framing: Framing = DEFAULT_FRAMING;
  private mode: ViewMode = DEFAULT_VIEW_MODE;
  private surface: ViewSurface | undefined;
  private lensCount = LENS_COUNT_BEFORE_A_LOAD;
  /**
   * The device reading the held view follows from; none while the device does not hold it.
   */
  private previous: DeviceReading | undefined;

  public constructor(
    private readonly events: EventSink<PlayerEvents>,
    private readonly measureViewport: () => ViewportSize,
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
   * Whether the device may turn the view in the current mode.
   */
  public get followsDevice(): boolean {
    return motionLookRulesFor(this.mode) !== undefined;
  }

  /**
   * The renderer of the loaded recording, or nothing between loads. A new renderer draws the
   * framing as it is now, however it changed while the recording was loading; the lens tiles are
   * measured by the lenses it draws from then on.
   */
  public attach(surface: ViewSurface | undefined): void {
    this.surface = surface;
    if (surface) this.lensCount = surface.lensCount;
    surface?.setViewMode(this.mode);
    surface?.setFraming(this.framing);
  }

  public set(view: ViewState): void {
    this.frame(this.rules().place(this.framing, view));
  }

  public setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.surface?.setViewMode(mode);
    this.events.emit('viewmodechange', mode);
  }

  public lookAt(yaw: Degrees, pitch: Degrees): void {
    this.frame(this.rules().place(this.framing, lookAt(this.framing.view, yaw, pitch)));
  }

  /**
   * Turns the view as the device turned: from its first reading on, the device holds the view.
   */
  public followDevice(reading: DeviceReading): void {
    const hold = followReading(this.framing.view, this.previous, reading);
    this.previous = hold.reading;
    this.frame({ ...this.framing, view: hold.view });
  }

  /**
   * The device no longer holds the view: it stays where it looks, level again.
   */
  public letGo(): void {
    if (!this.previous) return;
    this.previous = undefined;
    this.frame({ ...this.framing, view: withoutRoll(this.framing.view) });
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

  /**
   * Draws any change; announces one of the angles a page sees, not a roll alone.
   */
  private frame(next: Framing): void {
    if (isSameFraming(next, this.framing)) return;
    const haveAnglesChanged = !isSameAngles(next.view, this.framing.view);
    this.framing = next;
    this.surface?.setFraming(next);
    if (haveAnglesChanged) this.events.emit('viewchange', anglesOf(next.view));
  }

  private context(): ViewContext {
    return { viewport: this.measureViewport(), lensCount: this.lensCount };
  }

  private rules(): ViewGestureRules {
    const held = this.previous === undefined ? undefined : motionLookRulesFor(this.mode);
    return held ?? viewModeRulesFor(this.mode);
  }
}
