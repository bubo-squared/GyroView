import {
  GyroViewError,
  type PictureQuality,
  type ScreenPoint,
  type StabilizationMode,
  type ViewMode,
} from '@gyroview/core';

import { OBSERVED_ATTRIBUTES } from './attributeNames';
import { unreadableAngleWarning, viewAfterAttribute } from './attributes';
import {
  BOOLEAN_ATTRIBUTES,
  KEYWORD_ATTRIBUTES,
  NULLABLE_KEYWORD_ATTRIBUTES,
  PUBLIC_PROPERTIES,
  REQUEST_ATTRIBUTES,
  SOURCE_ATTRIBUTES,
  STRING_ATTRIBUTES,
  VIEW_ATTRIBUTES,
} from './elementProperties';
import { ElementLoads } from './ElementLoads';
import type { FileSource } from './elementSource';
import { FullscreenToggle } from './FullscreenToggle';
import { IdleWatcher } from './IdleWatcher';
import { applyPlaybackAttribute } from './playbackAttributes';
import { describeUnlessTheAuthorDid, renameUnlessTheAuthorDid } from './accessibleRegion';
import { applyEarlyProperties, takeEarlyProperties } from './earlyProperties';
import {
  defineLiveSettings,
  pictureQualityFrom,
  stabilizationModeFrom,
  viewModeFrom,
  type LiveSettings,
} from './liveSettings';
import {
  defineBooleanProperties,
  defineKeywordProperties,
  defineNullableKeywordProperties,
  defineStringProperties,
} from './reflectedProperties';
import { mirrorPlayerEvents } from './playerEventMirror';
import { PlayerCanvas } from './PlayerCanvas';
import { renderShadowTree } from './template';
import { TypedEventElement } from './TypedEventElement';
import { createBrowserPlayer } from '../browserPlayer';
import { queryShadow } from '../controls/controlParts';
import { bindControlsBar, type ControlsBar } from '../controls/controlsBar';
import type { ControlsHost } from '../controls/ControlsHost';
import { bindKeyboard, type KeyboardHost } from '../controls/keyboard';
import type { GyroViewMessageOverrides, GyroViewMessages } from '../controls/messages';
import { Wording } from '../controls/Wording';
import { ViewGestures } from '../controls/ViewGestures';
import { ensureFinite } from '../player/ensureFinite';
import type { Player } from '../player/Player';
import type { MotionLookState, PlayerStatus, PlayerWarning } from '../player/PlayerEvents';
import type { ViewAngles } from '../player/PlayerOptions';
import type { PipelineHost } from '../composition/ports';
import type { PlayerMetadata } from '../PlayerMetadata';
/**
 * `<gyro-view>`: the player as an element. Attributes name what to play and configure the
 * settings; the settings' properties report what is in effect now, as a media element's `muted`
 * does; the player's events are dispatched as `CustomEvent`s of the same name with the payload
 * in `detail`. Facade over {@link Player}, the controls and the gestures (ADR 0016).
 */
export class GyroViewElement extends TypedEventElement implements LiveSettings {
  public static readonly observedAttributes = OBSERVED_ATTRIBUTES;
  // The properties below are defined on each element as it is built: the mirrored attributes by
  // the define...Properties functions, the live settings by `defineLiveSettings` (ADR 0016).
  declare public src: string | null;
  declare public src2: string | null;
  declare public poster: string | null;
  declare public crossOrigin: 'anonymous' | 'use-credentials' | null;
  declare public preload: 'none' | 'auto';
  declare public gainMatch: 'on' | 'off';
  declare public autoplay: boolean;
  declare public controls: boolean;
  declare public stabilization: StabilizationMode;
  declare public viewMode: ViewMode;
  declare public quality: PictureQuality;
  declare public fov: number;
  declare public yaw: number;
  declare public pitch: number;
  declare public muted: boolean;
  declare public loop: boolean;
  declare public volume: number;
  /**
   * Properties the page set before the element was defined, kept until it is connected.
   */
  private readonly earlyProperties: Map<string, unknown>;
  private readonly player: Player;
  private readonly loads: ElementLoads;
  private readonly wording = new Wording();
  private readonly controlsBar: ControlsBar;
  private readonly fullscreen = new FullscreenToggle(this, () => {
    this.controlsBar.fullscreenChanged();
  });
  private readonly idle: IdleWatcher;
  private readonly posterImage: HTMLImageElement;
  private readonly canvas: PlayerCanvas;
  private gestures: ViewGestures;

  public constructor() {
    super();
    this.earlyProperties = takeEarlyProperties(this, PUBLIC_PROPERTIES);
    defineStringProperties(this, STRING_ATTRIBUTES);
    defineKeywordProperties(this, KEYWORD_ATTRIBUTES);
    defineNullableKeywordProperties(this, NULLABLE_KEYWORD_ATTRIBUTES);
    defineBooleanProperties(this, BOOLEAN_ATTRIBUTES);
    const shadow = this.attachShadow({ mode: 'open' });
    renderShadowTree(shadow);
    this.wording.write(shadow);
    const canvas = queryShadow(shadow, 'canvas', HTMLCanvasElement);
    const audio = queryShadow(shadow, 'audio', HTMLAudioElement);
    this.posterImage = queryShadow(shadow, '.poster', HTMLImageElement);
    this.canvas = new PlayerCanvas(canvas, this.onCanvasReplaced);
    this.player = createBrowserPlayer(this.pipelineHost(audio));
    this.loads = new ElementLoads(this, this.player, this.canvas);
    defineLiveSettings(this, this.player);
    const host = this.controlsHost();
    this.controlsBar = bindControlsBar(shadow, host);
    this.gestures = new ViewGestures(canvas, this.player, this.onPictureTap);
    bindKeyboard(this, host);
    this.idle = new IdleWatcher(this, () => this.player.status === 'playing');
    const { idle, wording } = this;
    mirrorPlayerEvents(this.player, { element: this, shadow, idle, wording });
  }

  /**
   * Where the player is: `idle` or `loading`, then the loaded recording's playback state.
   */
  public get status(): PlayerStatus {
    return this.player.status;
  }

  /**
   * What the player learned about the loaded recording; undefined until it is ready.
   */
  public get metadata(): PlayerMetadata | undefined {
    return this.player.metadata;
  }

  /**
   * The media time shown, in seconds; setting it seeks there exactly.
   */
  public get currentTime(): number {
    return this.player.currentTime;
  }

  public set currentTime(time: number) {
    this.seek(time);
  }

  /**
   * The loaded recording's length in seconds; 0 without one.
   */
  public get duration(): number {
    return this.player.duration;
  }

  /**
   * True unless playback is under way or waiting for data to go on, as a media element's.
   */
  public get paused(): boolean {
    return this.player.isPaused;
  }

  /**
   * Where the normal view looks: yaw and pitch in degrees, and the horizontal field of view.
   */
  public get view(): ViewAngles {
    return this.player.view;
  }

  /**
   * Whether turning the device turns the normal view: `on`, `off`, or `unavailable` where the
   * device reports no attitude or access was refused.
   */
  public get motionLook(): MotionLookState {
    return this.player.motionLook;
  }

  /**
   * Every word the element shows or says to assistive technology. Setting it replaces any of
   * them, table by table (`labels`, `stabilizationModes`, `viewModes`, `errors`); the others keep
   * their English defaults, and `null` brings them all back.
   */
  public get messages(): GyroViewMessages {
    return this.wording.current;
  }

  public set messages(overrides: GyroViewMessageOverrides | null | undefined) {
    const previousName = this.wording.current.labels.player;
    this.wording.replace(overrides);
    if (this.shadowRoot) this.wording.write(this.shadowRoot);
    renameUnlessTheAuthorDid(this, previousName, this.wording.current.labels.player);
  }

  public connectedCallback(): void {
    describeUnlessTheAuthorDid(this, this.wording.current.labels.player);
    applyEarlyProperties(this, this.earlyProperties, this.warn);
    this.dataset['status'] = this.player.status;
    this.idle.start();
    this.loads.connected();
    this.fullscreen.connected();
  }

  public disconnectedCallback(): void {
    this.idle.stop();
    void this.leaveIfRemoved();
  }

  public attributeChangedCallback(
    name: string,
    _previous: string | null,
    value: string | null,
  ): void {
    if (SOURCE_ATTRIBUTES.includes(name)) {
      this.loads.sourceChanged();
    } else if (REQUEST_ATTRIBUTES.includes(name)) {
      this.loads.requestChanged();
    } else if (VIEW_ATTRIBUTES.includes(name)) {
      this.player.setView(viewAfterAttribute(this.player.view, name, value));
      const warning = unreadableAngleWarning(name, value);
      if (warning !== undefined) this.warn(warning);
    } else {
      const targets = { player: this.player, posterImage: this.posterImage, warn: this.warn };
      applyPlaybackAttribute(targets, name, value);
    }
  }

  /**
   * Starts playing, waiting for a load in progress, one the attributes set just now asked for,
   * or, out of the document, the connection; resolves once playback runs. Rejects when the
   * browser refuses to start, with `no-source` without a recording, and with `play-interrupted`
   * when the element left the document or its recording was replaced first.
   */
  public async play(): Promise<void> {
    await this.loads.settled();
    if (!this.isConnected) {
      throw new GyroViewError('play-interrupted', 'the element left the document before playing');
    }
    await this.player.play();
  }

  /**
   * Pauses, keeping the frame on screen.
   */
  public pause(): void {
    this.player.pause();
  }

  /**
   * Pauses and goes back to the start.
   */
  public stop(): void {
    this.player.stop();
  }

  /**
   * Seeks exactly to `time` seconds; right after a new `src`, the new recording starts there.
   */
  public seek(time: number): void {
    ensureFinite(time, 'time');
    this.loads.seek(time);
  }

  /**
   * Seeks to the key frame at or before `time`: quick to show while a seek bar is dragged.
   */
  public scrub(time: number): Promise<void> {
    return this.player.scrub(time);
  }

  /**
   * Points the normal view at `yaw` and `pitch`, in degrees: yaw positive to the right, pitch
   * positive up.
   */
  public lookAt(yaw: number, pitch: number): void {
    this.player.lookAt(yaw, pitch);
  }

  /**
   * Brings the current view mode back to how it starts, the others keeping their framing.
   */
  public resetView(): void {
    this.player.resetView();
  }

  /**
   * Zooms by `steps` (positive zooms in, each step by a factor of 1.1, within each view mode's
   * limits) toward `focus`, a point of the picture as fractions of its size; about the centre
   * when none is given.
   */
  public zoom(steps: number, focus?: ScreenPoint): void {
    this.player.zoom(steps, focus);
  }

  /**
   * Lets the device turn the normal view, as a window into the recording. Call it from a tap's
   * handler: iOS asks the viewer for access there and refuses it anywhere else. Resolves with the
   * state it ends in (`motionLook`); a refusal is a `warning`, never a rejection.
   */
  public startMotionLook(): Promise<MotionLookState> {
    return this.player.startMotionLook();
  }

  /**
   * Gives the view back to the pointer, level, looking where it looked.
   */
  public stopMotionLook(): void {
    this.player.stopMotionLook();
  }

  /**
   * Stabilizes the picture in `mode` (`off`, `lock`, `horizon`, `follow`); any other value,
   * an unset one included, is refused.
   */
  public setStabilization(mode: StabilizationMode): void {
    this.player.setStabilization(stabilizationModeFrom(mode));
  }

  /**
   * Shows the picture in `mode` (`raw-lenses`, `equirectangular`, `normal`); any other value,
   * an unset one included, is refused.
   */
  public setViewMode(mode: ViewMode): void {
    this.player.setViewMode(viewModeFrom(mode));
  }

  /**
   * Reads the lens images as `quality` says (`fast`, `balanced`, `high`); any other value, an
   * unset one included, is refused.
   */
  public setQuality(quality: PictureQuality): void {
    this.player.setQuality(pictureQualityFrom(quality));
  }

  /**
   * Fills the screen with the player, through the Fullscreen API or pinned over the page, or
   * leaves it.
   */
  public toggleFullscreen(): Promise<void> {
    return this.fullscreen.toggle();
  }

  /**
   * Loads what the attributes (or the files handed in) name: the change already waiting to be
   * read, or else now; out of the document, once connected. Resolves once the recording is
   * ready; rejects with the failure, which is dispatched as an `error` event too.
   */
  public load(): Promise<void> {
    return this.loads.load();
  }

  /**
   * Plays local files instead of the `src` attributes, until `src` or `src2` change.
   */
  public loadFiles(files: FileSource): void {
    this.loads.loadFiles(files);
  }

  /**
   * A move within the document disconnects and connects again at once: only an element still out
   * of it a microtask later was removed. It lets its recording go, and leaves the pinned fill as
   * the browser's fullscreen element leaves fullscreen.
   */
  private async leaveIfRemoved(): Promise<void> {
    await Promise.resolve();
    if (this.isConnected) return;
    this.loads.removed();
    this.canvas.release();
    await this.fullscreen.exit();
  }

  /**
   * The canvas is read at each load, since a fresh one replaces one whose context is gone.
   */
  private pipelineHost(audio: HTMLAudioElement): PipelineHost {
    const { canvas } = this;
    return {
      get canvas(): HTMLCanvasElement {
        return canvas.current;
      },
      audio,
    };
  }

  private readonly onCanvasReplaced = (canvas: HTMLCanvasElement): void => {
    this.gestures.detach();
    this.gestures = new ViewGestures(canvas, this.player, this.onPictureTap);
  };

  /**
   * What the controls and the keyboard ask of the element. They live as long as the element:
   * their listeners sit on its own shadow tree and host, and on its player.
   */
  private controlsHost(): ControlsHost & KeyboardHost {
    return {
      player: this.player,
      wording: this.wording,
      togglePlay: this.togglePlayback,
      toggleFullscreen: (): void => {
        void this.toggleFullscreen();
      },
      warn: this.warn,
      isFullscreen: (): boolean => this.fullscreen.isActive,
      exitFullscreen: (): void => {
        void this.fullscreen.exit();
      },
    };
  }

  /**
   * A tap on the picture toggles playback, except a touch that brought hidden controls back:
   * touch has no hover to reveal them, so that tap is the viewer asking to see them. Without
   * controls there is nothing to reveal, and every tap toggles.
   */
  private readonly onPictureTap = (pointerType: string): void => {
    const isRevealingControls = this.controls && this.idle.wasIdleAtLastPress;
    if (pointerType !== 'mouse' && isRevealingControls) return;
    this.togglePlayback();
  };

  private readonly togglePlayback = (): void => {
    this.player.togglePlayback();
  };

  /**
   * Queued, as a media element queues its events: an attribute in the markup is read as the
   * element is defined, and a property before it, both before a page's script after the
   * definition adds its listener.
   */
  private readonly warn = (warning: PlayerWarning): void => {
    queueMicrotask(() => {
      this.dispatchEvent(new CustomEvent('warning', { detail: warning, composed: true }));
    });
  };
}
