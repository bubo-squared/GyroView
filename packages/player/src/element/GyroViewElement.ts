import { Deferred, messageOf, type StabilizationMode, type ViewMode } from '@gyroview/core';

import {
  OBSERVED_ATTRIBUTES,
  PlaybackAttribute,
  SourceAttribute,
  ViewAttribute,
} from './attributeNames';
import {
  GAIN_MATCH,
  PRELOAD,
  shouldPreload,
  unreadableAngleWarning,
  viewAfterAttribute,
} from './attributes';
import { elementSourceOf, type FileSource } from './elementSource';
import { FullscreenToggle } from './FullscreenToggle';
import { IdleWatcher } from './IdleWatcher';
import { applyPlaybackAttribute } from './playbackAttributes';
import { describeUnlessTheAuthorDid } from './accessibleRegion';
import { applyEarlyProperties, takeEarlyProperties } from './earlyProperties';
import {
  defineLiveSettings,
  LIVE_SETTING_NAMES,
  stabilizationModeFrom,
  viewModeFrom,
  type LiveSettings,
} from './liveSettings';
import {
  defineBooleanProperties,
  defineKeywordProperties,
  defineStringProperties,
  propertyNameOf,
} from './reflectedProperties';
import { mirrorPlayerEvents } from './playerEventMirror';
import { renderShadowTree } from './template';
import { TypedEventElement } from './TypedEventElement';
import { createBrowserPlayer } from '../browserPlayer';
import { queryShadow } from '../controls/controlParts';
import { bindControlsBar } from '../controls/controlsBar';
import type { ControlsHost } from '../controls/ControlsHost';
import { bindKeyboard, type KeyboardHost } from '../controls/keyboard';
import { ViewGestures } from '../controls/ViewGestures';
import { ensureFinite } from '../player/ensureFinite';
import type { Player } from '../player/Player';
import type { PlayerStatus, PlayerWarning } from '../player/PlayerEvents';
import type { ViewAngles } from '../player/PlayerOptions';
import type { PlayerMetadata } from '../PlayerMetadata';
/**
 * Attributes whose properties mirror them, as `img.src` does: what to play and how to present
 * it. The live settings (stabilization, view mode, view angles, sound, loop) have properties of
 * their own that report the player's current state.
 */
const STRING_ATTRIBUTES = [...Object.values(SourceAttribute), PlaybackAttribute.Poster];
const KEYWORD_ATTRIBUTES = [PRELOAD, GAIN_MATCH];
const BOOLEAN_ATTRIBUTES = [PlaybackAttribute.Autoplay, PlaybackAttribute.Controls];
const SOURCE_ATTRIBUTES: readonly string[] = Object.values(SourceAttribute);
/**
 * The properties a page may set before the element is defined, all kept for it.
 */
const PUBLIC_PROPERTIES: readonly string[] = [
  ...[
    ...STRING_ATTRIBUTES,
    ...KEYWORD_ATTRIBUTES.map(({ name }) => name),
    ...BOOLEAN_ATTRIBUTES,
  ].map((name) => propertyNameOf(name)),
  ...LIVE_SETTING_NAMES,
  'currentTime',
];
const VIEW_ATTRIBUTES: readonly string[] = Object.values(ViewAttribute);
/**
 * `<gyro-view>`: the player as an element. Attributes name what to play and configure the
 * settings; the settings' properties report what is in effect now, as a media element's `muted`
 * does; the player's events are dispatched as `CustomEvent`s of the same name with the payload
 * in `detail`. Facade over {@link Player}, the controls and the gestures (ADR 0016).
 */
export class GyroViewElement extends TypedEventElement implements LiveSettings {
  public static readonly observedAttributes = OBSERVED_ATTRIBUTES;
  declare public src: string | null;
  declare public src2: string | null;
  declare public poster: string | null;
  declare public preload: 'none' | 'auto';
  declare public gainMatch: 'on' | 'off';
  declare public autoplay: boolean;
  declare public controls: boolean;
  declare public stabilization: StabilizationMode;
  declare public viewMode: ViewMode;
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
  /**
   * A seek asked for with the attributes set just now, where the recording they load starts.
   */
  private startTime: number | undefined;
  private readonly player: Player;
  private readonly fullscreen = new FullscreenToggle(this);
  private readonly idle: IdleWatcher;
  private readonly posterImage: HTMLImageElement;
  private scheduledLoad: Promise<void> | undefined;
  /**
   * The recording the attributes name is still to be loaded once connected: at first, after a
   * removal let it go, and after a change of source while out of the document.
   */
  private isLoadOwed = true;
  /**
   * A `load()` asked for out of the document, settled by the load the connection starts.
   */
  private awaitedLoad: Deferred<void> | undefined;
  private files: FileSource | undefined;

  public constructor() {
    super();
    this.earlyProperties = takeEarlyProperties(this, PUBLIC_PROPERTIES);
    defineStringProperties(this, STRING_ATTRIBUTES);
    defineKeywordProperties(this, KEYWORD_ATTRIBUTES);
    defineBooleanProperties(this, BOOLEAN_ATTRIBUTES);
    const shadow = this.attachShadow({ mode: 'open' });
    renderShadowTree(shadow);
    const canvas = queryShadow(shadow, 'canvas', HTMLCanvasElement);
    const audio = queryShadow(shadow, 'audio', HTMLAudioElement);
    this.posterImage = queryShadow(shadow, '.poster', HTMLImageElement);
    this.player = createBrowserPlayer({ canvas, audio });
    defineLiveSettings(this, this.player);
    const host = this.controlsHost();
    bindControlsBar(shadow, host);
    new ViewGestures(canvas, this.player, this.onPictureTap);
    bindKeyboard(this, host);
    this.idle = new IdleWatcher(this, () => this.player.status === 'playing');
    mirrorPlayerEvents(this.player, { element: this, shadow, idle: this.idle });
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

  public connectedCallback(): void {
    describeUnlessTheAuthorDid(this);
    applyEarlyProperties(this, this.earlyProperties, this.warn);
    this.dataset['status'] = this.player.status;
    this.idle.start();
    if (this.isLoadOwed) this.scheduleLoad();
    void this.awaitedLoad?.follow(this.scheduledLoad ?? Promise.resolve());
    this.awaitedLoad = undefined;
  }

  public disconnectedCallback(): void {
    this.idle.stop();
    void this.releaseUnlessMoved();
  }

  public attributeChangedCallback(
    name: string,
    _previous: string | null,
    value: string | null,
  ): void {
    if (SOURCE_ATTRIBUTES.includes(name)) {
      this.files = undefined;
      this.scheduleLoad();
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
   * Starts playing, waiting for a load in progress, or one the attributes set just now asked
   * for; rejects when the browser refuses to start.
   */
  public async play(): Promise<void> {
    await this.scheduledLoadSettled();
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
    if (this.scheduledLoad) this.startTime = time;
    else this.player.seek(time);
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
   * Zooms by `steps` about the centre: positive zooms in, each step by a factor of 1.1, within
   * each view mode's limits.
   */
  public zoom(steps: number): void {
    this.player.zoom(steps);
  }

  /**
   * Stabilizes the picture in `mode` (`off`, `lock`, `horizon`, `follow`); any other value,
   * an unset one included, is refused.
   */
  public setStabilization(mode: StabilizationMode): void {
    this.player.setStabilization(stabilizationModeFrom(mode));
  }

  /**
   * Shows the picture in `mode` (`normal`, `equirectangular`, `raw-lenses`); any other value,
   * an unset one included, is refused.
   */
  public setViewMode(mode: ViewMode): void {
    this.player.setViewMode(viewModeFrom(mode));
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
    return this.isConnected ? (this.scheduledLoad ?? this.reload()) : this.loadOnConnection();
  }

  /**
   * Plays local files instead of the `src` attributes, until `src` or `src2` change.
   */
  public loadFiles(files: FileSource): void {
    this.files = files;
    this.scheduleLoad();
  }

  /**
   * What the controls and the keyboard ask of the element. They live as long as the element:
   * their listeners sit on its own shadow tree and host, and on its player.
   */
  private controlsHost(): ControlsHost & KeyboardHost {
    return {
      player: this.player,
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

  /**
   * Pauses, or starts playing and reports a refused start as a warning.
   */
  private readonly togglePlayback = (): void => {
    if (!this.player.isPaused) {
      this.player.pause();
      return;
    }
    void this.player.play().catch((error: unknown) => {
      this.warn({
        code: 'playback-failed',
        message: `playback could not start: ${messageOf(error)}`,
      });
    });
  };

  /**
   * Waits for the load the attributes set just now asked for, if any, however it ends: a
   * failure has been dispatched as an `error` event already.
   */
  private async scheduledLoadSettled(): Promise<void> {
    try {
      await this.scheduledLoad;
    } catch {
      // Reported as an `error` event.
    }
  }

  /**
   * The load the element starts when it is next connected, owed until then: only a connected
   * element can let its recording go again.
   */
  private loadOnConnection(): Promise<void> {
    this.isLoadOwed = true;
    this.awaitedLoad ??= new Deferred<void>();
    return this.awaitedLoad.promise;
  }

  /**
   * A move within the document disconnects and connects again at once: only an element still out
   * of it a microtask later lets its recording go.
   */
  private async releaseUnlessMoved(): Promise<void> {
    await Promise.resolve();
    if (this.isConnected) return;
    this.player.unload();
    this.isLoadOwed = true;
  }

  private scheduleLoad(): void {
    this.isLoadOwed = !this.isConnected;
    if (this.scheduledLoad || !this.isConnected) return;
    const scheduled = this.loadAfterPendingChanges();
    this.scheduledLoad = scheduled;
    void scheduled.catch(ignoreReportedFailure);
  }

  /**
   * Attribute changes arrive one at a time; a microtask later they are read together, so a `src`
   * set with its `src2` loads once.
   */
  private async loadAfterPendingChanges(): Promise<void> {
    await Promise.resolve();
    this.scheduledLoad = undefined;
    if (this.isConnected) await this.reload();
  }

  private reload(): Promise<void> {
    this.isLoadOwed = false;
    const read = (attribute: string): string | null => this.getAttribute(attribute);
    const source = elementSourceOf(read, document.baseURI, this.files);
    delete this.dataset['hasFrame'];
    const startTime = this.startTime;
    this.startTime = undefined;
    if (!source) {
      this.player.unload();
      return Promise.resolve();
    }
    const loading = this.player.load(source, {
      autoplay: this.autoplay,
      preload: shouldPreload(read(PlaybackAttribute.Preload)),
    });
    // The player is loading now, so it starts the recording there; a later seek replaces it.
    if (startTime !== undefined) this.player.seek(startTime);
    return loading;
  }

  private readonly warn = (warning: PlayerWarning): void => {
    this.dispatchEvent(new CustomEvent('warning', { detail: warning, composed: true }));
  };
}

/**
 * A failed load has already been dispatched as an `error` event; the promise adds nothing.
 */
function ignoreReportedFailure(): void {
  // Intentionally empty.
}
