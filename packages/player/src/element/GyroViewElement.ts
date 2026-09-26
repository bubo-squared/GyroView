import {
  degrees,
  messageOf,
  seconds,
  type GyroViewError,
  type StabilizationMode,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';

import {
  OBSERVED_ATTRIBUTES,
  PlaybackAttribute,
  SourceAttribute,
  ViewAttribute,
} from './attributeNames';
import { shouldPreload, viewAfterAttribute } from './attributes';
import { elementSourceOf, type FileSource } from './elementSource';
import { FullscreenToggle } from './FullscreenToggle';
import { IdleWatcher } from './IdleWatcher';
import { applyPlaybackAttribute } from './playbackAttributes';
import { defineLiveSettings, type LiveSettings } from './liveSettings';
import { defineBooleanProperties, defineStringProperties } from './reflectedProperties';
import { ELEMENT_TEMPLATE } from './template';
import { createBrowserPlayer } from '../browserPlayer';
import { queryShadow } from '../controls/controlParts';
import { bindControlsBar } from '../controls/controlsBar';
import type { ControlsHost } from '../controls/ControlsHost';
import { bindKeyboard, type KeyboardHost } from '../controls/keyboard';
import { ViewGestures } from '../controls/ViewGestures';
import type { Player } from '../player/Player';
import { PLAYER_EVENT_NAMES, type PlayerStatus } from '../player/PlayerEvents';
import type { PlayerMetadata } from '../PlayerMetadata';
/**
 * Attributes whose properties mirror them, as `img.src` does: what to play and how to present
 * it. The live settings (stabilization, view mode, view angles, sound, loop) have properties of
 * their own that report the player's current state.
 */
const STRING_ATTRIBUTES = [
  ...Object.values(SourceAttribute),
  PlaybackAttribute.Poster,
  PlaybackAttribute.Preload,
  PlaybackAttribute.GainMatch,
];
const BOOLEAN_ATTRIBUTES = [PlaybackAttribute.Autoplay, PlaybackAttribute.Controls];
const SOURCE_ATTRIBUTES: readonly string[] = Object.values(SourceAttribute);
const VIEW_ATTRIBUTES: readonly string[] = Object.values(ViewAttribute);
/**
 * What assistive technology calls the element when the page names it nothing else; the embed
 * snippet titles its frame the same.
 */
const ACCESSIBLE_NAME = '360° video player';

/**
 * `<gyro-view>`: the player as an element. Attributes name what to play and configure the
 * settings; the settings' properties report what is in effect now, as a media element's `muted`
 * does; the player's events are dispatched as `CustomEvent`s of the same name with the payload
 * in `detail`. Facade over {@link Player}, the controls and the gestures (ADR 0016).
 */
export class GyroViewElement extends HTMLElement implements LiveSettings {
  public static readonly observedAttributes = OBSERVED_ATTRIBUTES;
  declare public src: string | null;
  declare public src2: string | null;
  declare public poster: string | null;
  declare public preload: string | null;
  declare public gainMatch: string | null;
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
  private readonly player: Player;
  private readonly fullscreen = new FullscreenToggle(this);
  private readonly idle: IdleWatcher;
  private readonly posterImage: HTMLImageElement;
  private readonly errorMessage: HTMLElement;
  private readonly errorCode: HTMLElement;
  private scheduledLoad: Promise<void> | undefined;
  private files: FileSource | undefined;

  public constructor() {
    super();
    defineStringProperties(this, STRING_ATTRIBUTES);
    defineBooleanProperties(this, BOOLEAN_ATTRIBUTES);
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = ELEMENT_TEMPLATE;
    const canvas = queryShadow(shadow, 'canvas', HTMLCanvasElement);
    const audio = queryShadow(shadow, 'audio', HTMLAudioElement);
    this.posterImage = queryShadow(shadow, '.poster', HTMLImageElement);
    this.errorMessage = queryShadow(shadow, '.error-message', HTMLElement);
    this.errorCode = queryShadow(shadow, '.error-code', HTMLElement);
    this.player = createBrowserPlayer({ canvas, audio });
    defineLiveSettings(this, this.player);
    const host = this.controlsHost();
    bindControlsBar(shadow, host);
    new ViewGestures(canvas, this.player, this.togglePlayback);
    bindKeyboard(this, host);
    this.idle = new IdleWatcher(this, () => this.player.status === 'playing');
    this.observePlayer();
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
    this.player.seek(seconds(time));
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
  public get view(): ViewState {
    return this.player.view;
  }

  public connectedCallback(): void {
    this.describeUnlessTheAuthorDid();
    this.dataset['status'] = this.player.status;
    this.idle.start();
    this.scheduleLoad();
  }

  public disconnectedCallback(): void {
    this.idle.stop();
    this.player.unload();
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
    } else {
      const targets = { player: this.player, posterImage: this.posterImage, warn: this.warn };
      applyPlaybackAttribute(targets, name, value);
    }
  }

  /**
   * Starts playing, waiting for a load in progress; rejects when the browser refuses to start.
   */
  public play(): Promise<void> {
    return this.player.play();
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
   * Seeks exactly to `time` seconds.
   */
  public seek(time: number): void {
    this.player.seek(seconds(time));
  }

  /**
   * Seeks to the key frame at or before `time`: quick to show while a seek bar is dragged.
   */
  public scrub(time: number): Promise<void> {
    return this.player.scrub(seconds(time));
  }

  /**
   * Points the normal view at `yaw` and `pitch`, in degrees: yaw positive to the right, pitch
   * positive up.
   */
  public lookAt(yaw: number, pitch: number): void {
    this.player.lookAt(degrees(yaw), degrees(pitch));
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
   * Stabilizes the picture in `mode` (`off`, `lock`, `horizon`, `follow`).
   */
  public setStabilization(mode: StabilizationMode): void {
    this.stabilization = mode;
  }

  /**
   * Shows the picture in `mode` (`normal`, `equirectangular`, `raw-lenses`).
   */
  public setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
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
   * read, or else now. Resolves once the recording is ready; rejects with the failure, which is
   * dispatched as an `error` event too.
   */
  public load(): Promise<void> {
    return this.scheduledLoad ?? this.reload();
  }

  /**
   * Plays local files instead of the `src` attributes, until `src` or `src2` change.
   */
  public loadFiles(files: FileSource): void {
    this.files = files;
    this.scheduleLoad();
  }

  /**
   * The element takes focus and keys, so assistive technology needs to know what it is: a named
   * region, unless the page gave it a role, a name or a tab order of its own.
   */
  private describeUnlessTheAuthorDid(): void {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    if (!this.hasAttribute('role')) this.setAttribute('role', 'region');
    const isNamed = this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby');
    if (!isNamed) this.setAttribute('aria-label', ACCESSIBLE_NAME);
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
   * Pauses, or starts playing and reports a refused start as a warning.
   */
  private readonly togglePlayback = (): void => {
    if (!this.player.isPaused) {
      this.player.pause();
      return;
    }
    void this.player.play().catch((error: unknown) => {
      this.warn(`playback could not start: ${messageOf(error)}`);
    });
  };

  private scheduleLoad(): void {
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
    await this.reload();
  }

  private reload(): Promise<void> {
    const read = (attribute: string): string | null => this.getAttribute(attribute);
    const source = elementSourceOf(read, document.baseURI, this.files);
    delete this.dataset['hasFrame'];
    if (!source) {
      this.player.unload();
      return Promise.resolve();
    }
    return this.player.load(source, {
      autoplay: this.autoplay,
      preload: shouldPreload(read(PlaybackAttribute.Preload)),
    });
  }

  /**
   * The element's own bookkeeping runs before the events reach page listeners, so a listener
   * sees the attributes already matching the event it hears. Every player event is then
   * dispatched as a composed `CustomEvent` of the same name, the payload in `detail`.
   */
  private observePlayer(): void {
    this.player.events.on('statuschange', (status) => {
      this.dataset['status'] = status;
      this.idle.refresh();
    });
    this.player.events.on('frame', () => {
      this.dataset['hasFrame'] = '';
    });
    this.player.events.on('error', (error) => {
      this.showError(error);
    });
    for (const name of PLAYER_EVENT_NAMES) {
      this.player.events.on(name, (detail) => {
        this.dispatchEvent(new CustomEvent(name, { detail, composed: true }));
      });
    }
  }

  private showError(error: GyroViewError): void {
    this.errorMessage.textContent = error.message;
    this.errorCode.textContent = error.code;
  }

  private readonly warn = (message: string): void => {
    this.dispatchEvent(new CustomEvent('warning', { detail: message, composed: true }));
  };
}

/**
 * A failed load has already been dispatched as an `error` event; the promise adds nothing.
 */
function ignoreReportedFailure(): void {
  // Intentionally empty.
}
