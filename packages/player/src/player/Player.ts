import {
  Deferred,
  GyroViewError,
  hasErrorCode,
  isFlowing,
  messageOf,
  seconds,
  TypedEmitter,
  type Degrees,
  type DragDelta,
  type ScreenPoint,
  type Seconds,
  type StabilizationMode,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';

import { cssSizeOf } from './DrawingBufferFit';
import { FrameLoop } from './FrameLoop';
import { loadRecording, type LoadedRecording } from './loadRecording';
import type { PlayerEvents, PlayerStatus } from './PlayerEvents';
import type { LoadOptions, PlayerParts } from './PlayerOptions';
import { IDLE, statusOf, type LoadingPhase, type PlayerPhase } from './PlayerPhase';
import { PictureSettings } from './PictureSettings';
import { PlayerSound } from './PlayerSound';
import { PlayerView } from './PlayerView';
import { SessionRelay } from './SessionRelay';

import type { PlayerMetadata } from '../PlayerMetadata';
import type { PlayerSource } from '../PlayerSource';

/**
 * Headless player: the facade the element drives (and the embed bridge, through the element).
 * Owns one loaded recording at a time, relays its session's events in media-element terms
 * (`SessionRelay`), and owns the settings (view, view mode, stabilization, gain matching, sound,
 * loop), which carry over from load to load. Everything DOM it touches is handed in.
 */
export class Player {
  public readonly events = new TypedEmitter<PlayerEvents>();
  private readonly loop: FrameLoop;
  private phase: PlayerPhase = IDLE;
  private readonly viewing: PlayerView;
  private readonly picture = new PictureSettings(this.events);
  private readonly sound: PlayerSound;
  private readonly relay = new SessionRelay({
    events: this.events,
    onState: (): void => {
      this.announceStatus();
    },
    onEnded: (): void => {
      this.onEnded();
    },
  });
  private isLoopingValue = false;
  private lastStatus: PlayerStatus = 'idle';

  public constructor(private readonly parts: PlayerParts) {
    this.loop = new FrameLoop(() => {
      this.loaded?.pipeline.session.tick();
    });
    this.sound = new PlayerSound(parts.host.audio, this.events);
    const { canvas } = parts.host;
    this.viewing = new PlayerView(this.events, () => cssSizeOf(canvas));
  }

  public get status(): PlayerStatus {
    return statusOf(this.phase);
  }

  public get metadata(): PlayerMetadata | undefined {
    return this.loaded?.opened.metadata;
  }

  public get currentTime(): Seconds {
    return this.loaded?.pipeline.session.currentTime ?? seconds(0);
  }

  public get duration(): Seconds {
    return this.loaded?.opened.duration ?? seconds(0);
  }

  /**
   * False while playing or holding for frames, as a media element's `paused`.
   */
  public get isPaused(): boolean {
    return !isFlowing(this.loaded?.pipeline.session.state);
  }

  public get view(): ViewState {
    return this.viewing.current;
  }

  public get viewMode(): ViewMode {
    return this.viewing.viewMode;
  }

  /**
   * Whether a drag moves the picture as it is framed now; the view mode decides.
   */
  public get canPan(): boolean {
    return this.viewing.canPan;
  }

  public get stabilization(): StabilizationMode {
    return this.picture.stabilization;
  }

  public get isLooping(): boolean {
    return this.isLoopingValue;
  }

  public get volume(): number {
    return this.sound.volume;
  }

  public get isMuted(): boolean {
    return this.sound.isMuted;
  }

  /**
   * Whether `setVolume` changes anything on this platform; iOS leaves media at the device's volume.
   */
  public get canSetVolume(): boolean {
    return this.sound.canSetVolume;
  }

  /**
   * Replaces whatever was loaded. Resolves once the recording is ready (and started, with
   * `autoplay`); rejects with the failure after reporting it as an `error` event. A load that a
   * newer load or `unload` supersedes resolves quietly.
   */
  public async load(source: PlayerSource, options: LoadOptions = {}): Promise<void> {
    this.unload();
    const loading: LoadingPhase = {
      kind: 'loading',
      controller: new AbortController(),
      settled: new Deferred(),
    };
    this.phase = loading;
    this.announceStatus();
    try {
      await this.complete(loading, source, options);
    } catch (error) {
      if (loading.controller.signal.aborted) return;
      throw this.failWith(error);
    } finally {
      loading.settled.resolve();
    }
  }

  public unload(): void {
    const previous = this.phase;
    this.phase = IDLE;
    if (previous.kind === 'loading') previous.controller.abort();
    this.loop.stop();
    this.relay.detach();
    this.viewing.attach(undefined);
    this.picture.attach(undefined);
    if (previous.kind === 'loaded') previous.loaded.dispose();
    this.announceStatus();
  }

  /**
   * Starts playback, after a load in progress is ready, as a media element's `play()` does.
   * Rejects with the load's failure, or with `playback-blocked` when the browser wants a user
   * gesture first; with nothing loaded there is nothing to start.
   */
  public async play(): Promise<void> {
    await this.loadInProgress();
    if (this.phase.kind === 'failed') throw this.phase.failure;
    await this.loaded?.pipeline.session.play();
  }

  public pause(): void {
    this.loaded?.pipeline.session.pause();
  }

  public stop(): void {
    this.loaded?.pipeline.session.stop();
  }

  public seek(time: Seconds): void {
    this.loaded?.pipeline.session.seek(time);
  }

  /**
   * Seeks to the key frame at or before `time`: quick to show while a seek bar is dragged.
   */
  public async scrub(time: Seconds): Promise<void> {
    await this.loaded?.pipeline.session.scrub(time);
  }

  public setView(view: ViewState): void {
    this.viewing.set(view);
  }

  public lookAt(yaw: Degrees, pitch: Degrees): void {
    this.viewing.lookAt(yaw, pitch);
  }

  /**
   * The viewer dragged the picture by `delta` CSS pixels across the canvas.
   */
  public pan(delta: DragDelta): void {
    this.viewing.pan(delta);
  }

  /**
   * The viewer turned by the given angles, as the arrow keys do.
   */
  public turn(yawDelta: Degrees, pitchDelta: Degrees): void {
    this.viewing.turn(yawDelta, pitchDelta);
  }

  /**
   * Zooms by `steps` (positive zooms in) toward `focus`, a point of the canvas as fractions of its
   * size; about the centre when none is given.
   */
  public zoom(steps: number, focus?: ScreenPoint): void {
    this.viewing.zoom(steps, focus);
  }

  public resetView(): void {
    this.viewing.reset();
  }

  public setViewMode(mode: ViewMode): void {
    this.viewing.setMode(mode);
  }

  public setStabilization(mode: StabilizationMode): void {
    this.picture.setStabilization(mode);
  }

  public setLooping(isLooping: boolean): void {
    this.isLoopingValue = isLooping;
  }

  /**
   * Whether the lenses' exposure is matched along the seam; kept across loads.
   */
  public setGainMatching(isEnabled: boolean): void {
    this.picture.setGainMatching(isEnabled);
  }

  public setVolume(volume: number): void {
    this.sound.setVolume(volume);
  }

  public setMuted(isMuted: boolean): void {
    this.sound.setMuted(isMuted);
  }

  public dispose(): void {
    this.unload();
    this.sound.dispose();
    this.events.removeAll();
  }

  private get loaded(): LoadedRecording | undefined {
    return this.phase.kind === 'loaded' ? this.phase.loaded : undefined;
  }

  private async loadInProgress(): Promise<void> {
    if (this.phase.kind === 'loading') await this.phase.settled.promise;
  }

  private async complete(
    loading: LoadingPhase,
    source: PlayerSource,
    options: LoadOptions,
  ): Promise<void> {
    const { signal } = loading.controller;
    const loaded = await loadRecording({ source, parts: this.parts, signal });
    // A newer load may have started between the last abort check and here; its parts belong to
    // nobody now.
    if (signal.aborted) {
      loaded.dispose();
      return;
    }
    this.attach(loaded);
    if (options.preload !== false) loaded.pipeline.session.preload();
    if (options.autoplay) await this.autoplay();
  }

  private attach(loaded: LoadedRecording): void {
    this.phase = { kind: 'loaded', loaded };
    this.viewing.attach(loaded.pipeline.renderer);
    const { session } = loaded.pipeline;
    this.picture.attach(loaded.pipeline);
    this.relay.attach(session);
    this.loop.start();
    this.announceStatus();
    for (const warning of [...loaded.opened.warnings, ...loaded.pipeline.warnings]) {
      this.events.emit('warning', warning);
    }
    this.events.emit('ready', loaded.opened.metadata);
  }

  /**
   * A refused start leaves the recording loaded and paused: a warning, never a failed load.
   */
  private async autoplay(): Promise<void> {
    try {
      await this.play();
    } catch (error) {
      this.events.emit(
        'warning',
        hasErrorCode(error, 'playback-blocked')
          ? 'autoplay was blocked; playback waits for a user gesture'
          : `autoplay failed: ${messageOf(error)}`,
      );
    }
  }

  private onEnded(): void {
    this.events.emit('ended', undefined);
    if (this.isLoopingValue) void this.replay();
  }

  private async replay(): Promise<void> {
    try {
      await this.play();
    } catch (error) {
      this.events.emit('warning', `the loop could not restart playback: ${messageOf(error)}`);
    }
  }

  private failWith(error: unknown): GyroViewError {
    const failure =
      error instanceof GyroViewError
        ? error
        : new GyroViewError('invariant-violation', 'the player failed unexpectedly', {
            cause: error,
          });
    this.phase = { kind: 'failed', failure };
    this.announceStatus();
    this.events.emit('error', failure);
    return failure;
  }

  /**
   * Announces the status the phase gives now, once for each change.
   */
  private announceStatus(): void {
    const { status } = this;
    if (status === this.lastStatus) return;
    this.lastStatus = status;
    this.events.emit('statuschange', status);
  }
}
