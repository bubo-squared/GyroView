import type { PictureQuality, ScreenPoint, StabilizationMode, ViewMode } from '@gyroview/core';

import {
  OBSERVED_ATTRIBUTES,
  PlaybackAttribute,
  SourceAttribute,
  ViewAttribute,
} from './attributeNames';
import { GAIN_MATCH, PRELOAD, unreadableAngleWarning, viewAfterAttribute } from './attributes';
import { ElementLoads } from './ElementLoads';
import type { FileSource } from './elementSource';
import { FullscreenToggle } from './FullscreenToggle';
import { IdleWatcher } from './IdleWatcher';
import { applyPlaybackAttribute } from './playbackAttributes';
import { describeUnlessTheAuthorDid, renameUnlessTheAuthorDid } from './accessibleRegion';
import { applyEarlyProperties, takeEarlyProperties } from './earlyProperties';
import {
  defineLiveSettings,
  LIVE_SETTING_NAMES,
  pictureQualityFrom,
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
import { togglePlayback } from '../controls/customControls';
import type { ControlsHost } from '../controls/ControlsHost';
import { bindKeyboard, type KeyboardHost } from '../controls/keyboard';
import type { GyroViewMessageOverrides, GyroViewMessages } from '../controls/messages';
import { Wording } from '../controls/Wording';
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
  'messages',
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
  // The properties below are defined on each element as it is built: the mirrored attributes by
  // the define...Properties functions, the live settings by `defineLiveSettings` (ADR 0016).
  declare public src: string | null;
  declare public src2: string | null;
  declare public poster: string | null;
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
  private readonly fullscreen = new FullscreenToggle(this);
  private readonly idle: IdleWatcher;
  private readonly posterImage: HTMLImageElement;

  public constructor() {
    super();
    this.earlyProperties = takeEarlyProperties(this, PUBLIC_PROPERTIES);
    defineStringProperties(this, STRING_ATTRIBUTES);
    defineKeywordProperties(this, KEYWORD_ATTRIBUTES);
    defineBooleanProperties(this, BOOLEAN_ATTRIBUTES);
    const shadow = this.attachShadow({ mode: 'open' });
    renderShadowTree(shadow);
    this.wording.write(shadow);
    const canvas = queryShadow(shadow, 'canvas', HTMLCanvasElement);
    const audio = queryShadow(shadow, 'audio', HTMLAudioElement);
    this.posterImage = queryShadow(shadow, '.poster', HTMLImageElement);
    this.player = createBrowserPlayer({ canvas, audio });
    this.loads = new ElementLoads(this, this.player);
    defineLiveSettings(this, this.player);
    const host = this.controlsHost();
    bindControlsBar(shadow, host);
    new ViewGestures(canvas, this.player, this.onPictureTap);
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
  }

  public disconnectedCallback(): void {
    this.idle.stop();
    void this.loads.disconnected();
  }

  public attributeChangedCallback(
    name: string,
    _previous: string | null,
    value: string | null,
  ): void {
    if (SOURCE_ATTRIBUTES.includes(name)) {
      this.loads.sourceChanged();
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
    await this.loads.settled();
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

  /**
   * Pauses, or starts playing and reports a refused start as a warning.
   */
  private readonly togglePlayback = (): void => {
    togglePlayback(this.player);
  };

  private readonly warn = (warning: PlayerWarning): void => {
    this.dispatchEvent(new CustomEvent('warning', { detail: warning, composed: true }));
  };
}
