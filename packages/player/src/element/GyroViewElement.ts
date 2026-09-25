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
import { defineLiveSettings } from './liveSettings';
import { defineBooleanProperties, defineStringProperties } from './reflectedProperties';
import { relayPlayerEvents } from './relayPlayerEvents';
import { ELEMENT_TEMPLATE } from './template';
import { browserPorts } from '../composition/browserPorts';
import { buildPipeline, type PipelineHost } from '../composition/buildPipeline';
import { queryShadow } from '../controls/controlParts';
import { ControlsBar } from '../controls/ControlsBar';
import { KeyboardBinding } from '../controls/KeyboardBinding';
import { ViewGestures } from '../controls/ViewGestures';
import { Player } from '../player/Player';
import type { PlayerStatus } from '../player/PlayerEvents';
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
 * `<gyro-view>`: the player as an element. Attributes name what to play and configure the
 * settings; the settings' properties report what is in effect now, as a media element's `muted`
 * does; the player's events are dispatched as `CustomEvent`s of the same name with the payload
 * in `detail`. Facade over {@link Player}, the controls and the gestures (ADR 0016).
 */
export class GyroViewElement extends HTMLElement {
  public static readonly observedAttributes = OBSERVED_ATTRIBUTES;
  declare public src: string | null;
  declare public src2: string | null;
  declare public proxy: string | null;
  declare public quality: string | null;
  declare public poster: string | null;
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
  private readonly controlsBar: ControlsBar;
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
    this.player = browserPlayer({ canvas, audio });
    defineLiveSettings(this, this.player);
    this.controlsBar = new ControlsBar(shadow, {
      player: this.player,
      togglePlay: this.togglePlayLater,
      toggleFullscreen: this.toggleFullscreenLater,
      changeQuality: (quality): void => {
        this.quality = quality;
      },
      warn: this.warnLater,
    });
    new ViewGestures(canvas, this.player, this.togglePlayLater);
    this.bindKeyboard();
    this.idle = new IdleWatcher(this, () => this.player.status === 'playing');
    this.observePlayer();
  }

  public get status(): PlayerStatus {
    return this.player.status;
  }

  public get metadata(): PlayerMetadata | undefined {
    return this.player.metadata;
  }

  public get currentTime(): number {
    return this.player.currentTime;
  }

  public set currentTime(time: number) {
    this.player.seek(seconds(time));
  }

  public get duration(): number {
    return this.player.duration;
  }

  public get paused(): boolean {
    return this.player.isPaused;
  }

  public get view(): ViewState {
    return this.player.view;
  }

  public connectedCallback(): void {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
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
      const targets = { player: this.player, posterImage: this.posterImage, warn: this.warnLater };
      applyPlaybackAttribute(targets, name, value);
    }
  }

  public play(): Promise<void> {
    return this.player.play();
  }

  public pause(): void {
    this.player.pause();
  }

  public stop(): void {
    this.player.stop();
  }

  public seek(time: number): void {
    this.player.seek(seconds(time));
  }

  /**
   * Seeks to the key frame at or before `time`: quick to show while a seek bar is dragged.
   */
  public scrub(time: number): Promise<void> {
    return this.player.scrub(seconds(time));
  }

  public lookAt(yaw: number, pitch: number): void {
    this.player.lookAt(degrees(yaw), degrees(pitch));
  }

  public resetView(): void {
    this.player.resetView();
  }

  public zoom(steps: number): void {
    this.player.zoom(steps);
  }

  public setStabilization(mode: StabilizationMode): void {
    this.stabilization = mode;
  }

  public setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

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
   * Plays local files instead of the `src` attributes, until those change again.
   */
  public loadFiles(files: FileSource): void {
    this.files = files;
    this.scheduleLoad();
  }

  /**
   * The controls, gestures and keyboard live as long as the element: their listeners sit on its
   * own shadow tree, canvas and host, and on its player.
   */
  private bindKeyboard(): void {
    new KeyboardBinding(this, {
      player: this.player,
      togglePlay: this.togglePlayLater,
      toggleFullscreen: this.toggleFullscreenLater,
      isFullscreen: (): boolean => this.fullscreen.isActive,
      exitFullscreen: (): void => {
        void this.fullscreen.exit();
      },
    });
  }

  private readonly warnLater = (message: string): void => {
    this.warn(message);
  };

  private readonly togglePlayLater = (): void => {
    if (!this.player.isPaused) {
      this.player.pause();
      return;
    }
    void this.player.play().catch((error: unknown) => {
      this.warn(`playback could not start: ${messageOf(error)}`);
    });
  };

  private readonly toggleFullscreenLater = (): void => {
    void this.toggleFullscreen();
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
    const { source, problems } = elementSourceOf(read, document.baseURI, this.files);
    for (const problem of problems) this.warn(problem);
    delete this.dataset['hasFrame'];
    if (!source) {
      this.player.unload();
      return Promise.resolve();
    }
    this.controlsBar.setQuality(source.quality);
    return this.player.load(source, {
      autoplay: this.autoplay,
      preload: shouldPreload(read(PlaybackAttribute.Preload)),
    });
  }

  /**
   * The element's own bookkeeping runs before the events reach page listeners, so a listener
   * sees the attributes already matching the event it hears.
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
    relayPlayerEvents(this.player, this);
  }

  private showError(error: GyroViewError): void {
    this.errorMessage.textContent = error.message;
    this.errorCode.textContent = error.code;
  }

  private warn(message: string): void {
    this.dispatchEvent(new CustomEvent('warning', { detail: message, composed: true }));
  }
}

/**
 * The player composed for a browser: HTTP, blob and WebCodecs ports, the GPU pipeline.
 */
function browserPlayer(host: PipelineHost): Player {
  return new Player({ host, ports: browserPorts(), pipelines: buildPipeline });
}

/**
 * A failed load or a refused play has already been dispatched as an `error` event or handled
 * by the session; the promise adds nothing.
 */
function ignoreReportedFailure(): void {
  // Intentionally empty.
}
