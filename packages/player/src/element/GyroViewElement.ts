import {
  degrees,
  seconds,
  type GyroViewError,
  type StabilizationMode,
  type ViewState,
} from '@gyroview/core';

import {
  OBSERVED_ATTRIBUTES,
  PlaybackAttribute,
  SourceAttribute,
  stabilizationFromAttribute,
  ViewAttribute,
  viewFromAttributes,
} from './attributes';
import { elementSourceOf, type FileSource } from './elementSource';
import { FullscreenToggle } from './FullscreenToggle';
import { IdleWatcher } from './IdleWatcher';
import { applyPlaybackAttribute } from './playbackAttributes';
import {
  defineBooleanProperties,
  defineNumberProperties,
  defineStringProperties,
} from './reflectedProperties';
import { relayPlayerEvents } from './relayPlayerEvents';
import { ELEMENT_TEMPLATE } from './template';
import { browserPorts } from '../composition/browserPorts';
import { queryShadow } from '../controls/controlParts';
import { ControlsBar } from '../controls/ControlsBar';
import { KeyboardBinding } from '../controls/KeyboardBinding';
import { ViewGestures } from '../controls/ViewGestures';
import { Player } from '../player/Player';
import type { PlayerStatus } from '../player/PlayerEvents';
import type { PlayerMetadata } from '../PlayerMetadata';
const STRING_ATTRIBUTES = [
  ...Object.values(SourceAttribute),
  PlaybackAttribute.Stabilization,
  PlaybackAttribute.Poster,
  ViewAttribute.Projection,
];
const NUMBER_ATTRIBUTES = [ViewAttribute.FieldOfView, ViewAttribute.Yaw, ViewAttribute.Pitch];
const BOOLEAN_ATTRIBUTES = [
  PlaybackAttribute.Autoplay,
  PlaybackAttribute.Muted,
  PlaybackAttribute.Loop,
  PlaybackAttribute.Controls,
];
const SOURCE_ATTRIBUTES: readonly string[] = Object.values(SourceAttribute);
const VIEW_ATTRIBUTES: readonly string[] = Object.values(ViewAttribute);

/**
 * `<gyro-view>`: the player as an element. Attributes name what to play and how; properties
 * mirror them; the player's events are dispatched as `CustomEvent`s of the same name with the
 * payload in `detail`. Facade over {@link Player}, the controls and the gestures.
 */
export class GyroViewElement extends HTMLElement {
  public static readonly observedAttributes = OBSERVED_ATTRIBUTES;
  declare public src: string | null;
  declare public src2: string | null;
  declare public proxy: string | null;
  declare public quality: string | null;
  declare public stabilization: string | null;
  declare public projection: string | null;
  declare public poster: string | null;
  declare public fov: number | undefined;
  declare public yaw: number | undefined;
  declare public pitch: number | undefined;
  declare public autoplay: boolean;
  declare public muted: boolean;
  declare public loop: boolean;
  declare public controls: boolean;
  private readonly player: Player;
  private readonly controlsBar: ControlsBar;
  private readonly gestures: ViewGestures;
  private readonly keyboard: KeyboardBinding;
  private readonly fullscreen = new FullscreenToggle(this);
  private readonly idle: IdleWatcher;
  private readonly posterImage: HTMLImageElement;
  private readonly errorMessage: HTMLElement;
  private readonly errorCode: HTMLElement;
  private isLoadScheduled = false;
  private files: FileSource | undefined;

  public constructor() {
    super();
    defineStringProperties(this, STRING_ATTRIBUTES);
    defineNumberProperties(this, NUMBER_ATTRIBUTES);
    defineBooleanProperties(this, BOOLEAN_ATTRIBUTES);
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = ELEMENT_TEMPLATE;
    const canvas = queryShadow(shadow, 'canvas', HTMLCanvasElement);
    const audio = queryShadow(shadow, 'audio', HTMLAudioElement);
    this.posterImage = queryShadow(shadow, '.poster', HTMLImageElement);
    this.errorMessage = queryShadow(shadow, '.error-message', HTMLElement);
    this.errorCode = queryShadow(shadow, '.error-code', HTMLElement);
    this.player = new Player({ host: { canvas, audio }, ports: browserPorts() });
    this.controlsBar = new ControlsBar(shadow, {
      player: this.player,
      toggleFullscreen: this.toggleFullscreenLater,
      changeQuality: (quality): void => {
        this.quality = quality;
      },
    });
    this.gestures = new ViewGestures(canvas, this.player, this.togglePlayLater);
    this.keyboard = this.bindKeyboard();
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

  public get volume(): number {
    return this.player.volume;
  }

  public set volume(volume: number) {
    this.player.setVolume(volume);
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
      this.player.setView(this.viewFromAttributes());
    } else {
      applyPlaybackAttribute({ player: this.player, posterImage: this.posterImage }, name, value);
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

  public toggleFullscreen(): Promise<void> {
    return this.fullscreen.toggle();
  }

  /**
   * Plays local files instead of the `src` attributes, until those change again.
   */
  public loadFiles(files: FileSource): void {
    this.files = files;
    this.scheduleLoad();
  }

  private bindKeyboard(): KeyboardBinding {
    return new KeyboardBinding(this, {
      player: this.player,
      togglePlay: this.togglePlayLater,
      toggleFullscreen: this.toggleFullscreenLater,
      isFullscreen: (): boolean => this.fullscreen.isActive,
      exitFullscreen: (): void => {
        void this.fullscreen.exit();
      },
    });
  }

  private readonly togglePlayLater = (): void => {
    if (!this.player.isPaused) {
      this.player.pause();
      return;
    }
    void this.player.play().catch((error: unknown) => {
      this.warn(
        `playback could not start: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  private readonly toggleFullscreenLater = (): void => {
    void this.toggleFullscreen();
  };

  /**
   * Attribute changes arrive one at a time; one microtask later they are read together so a
   * `src` set with its `src2` loads once.
   */
  private scheduleLoad(): void {
    if (this.isLoadScheduled || !this.isConnected) return;
    this.isLoadScheduled = true;
    queueMicrotask(() => {
      this.isLoadScheduled = false;
      this.reload();
    });
  }

  private reload(): void {
    const read = (attribute: string): string | null => this.getAttribute(attribute);
    const { source, problems } = elementSourceOf(read, document.baseURI, this.files);
    for (const problem of problems) this.warn(problem);
    delete this.dataset['hasFrame'];
    if (!source) {
      this.player.unload();
      return;
    }
    const stabilization = stabilizationFromAttribute(read(PlaybackAttribute.Stabilization));
    this.player.setMuted(this.muted);
    this.player.setLooping(this.loop);
    this.controlsBar.setQuality(source.quality);
    void this.player
      .load(source, {
        view: this.viewFromAttributes(),
        autoplay: this.autoplay,
        ...(stabilization && { stabilization }),
      })
      .catch(ignoreReportedFailure);
  }

  private viewFromAttributes(): ViewState {
    return viewFromAttributes((attribute) => this.getAttribute(attribute), this.player.view);
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
 * A failed load or a refused play has already been dispatched as an `error` event or handled
 * by the session; the promise adds nothing.
 */
function ignoreReportedFailure(): void {
  // Intentionally empty.
}
