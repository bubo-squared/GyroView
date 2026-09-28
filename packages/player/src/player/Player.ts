import {
  degrees,
  GyroViewError,
  hasErrorCode,
  isFlowing,
  messageOf,
  Outbox,
  seconds,
  TypedEmitter,
  type DragDelta,
  type ScreenPoint,
  type Seconds,
  type StabilizationMode,
  type ViewMode,
} from '@gyroview/core';

import { cssSizeOf } from './DrawingBufferFit';
import { ensureFinite, viewStateOf } from './ensureFinite';
import { FrameLoop } from './FrameLoop';
import { loadRecording, type LoadedRecording } from './loadRecording';
import type { PlayerEvents, PlayerStatus } from './PlayerEvents';
import type { LoadOptions, PlayerParts, ViewAngles } from './PlayerOptions';
import { IDLE, loadingPhase, statusOf, type LoadingPhase, type PlayerPhase } from './PlayerPhase';
import { PictureSettings } from './PictureSettings';
import { PlayerSound } from './PlayerSound';
import { PlayerView } from './PlayerView';
import { SessionRelay } from './SessionRelay';

import type { PlayerMetadata } from '../PlayerMetadata';
import type { PlayerSource } from '../PlayerSource';

/**
 * The player without the element, which `createBrowserPlayer` gives: it plays one recording at a
 * time on the canvas and audio element it was handed, reports in media-element events, and keeps
 * its settings (view, view mode, stabilization, gain matching, sound, loop) from load to load.
 * `<gyro-view>` is a facade over it.
 */
export class Player {
  public readonly events = new TypedEmitter<PlayerEvents>();
  /**
   * What the player and its parts announce, heard once each change is whole (ADR 0021).
   */
  private readonly outbox = new Outbox(this.events);
  private readonly loop: FrameLoop;
  private phase: PlayerPhase = IDLE;
  private readonly viewing: PlayerView;
  private readonly picture = new PictureSettings(this.outbox);
  /**
   * A seek asked for before a recording was ready, where the next one starts.
   */
  private pendingStartTime: Seconds | undefined;
  private readonly sound: PlayerSound;
  private readonly relay = new SessionRelay({
    events: this.outbox,
    onState: (): void => {
      this.announceStatus();
    },
    onEnded: (): void => {
      this.onEnded();
    },
  });
  private isLoopingValue = false;
  /**
   * Past `dispose`: a listener of the idle it announces must not load again.
   */
  private isDisposed = false;
  /**
   * The status listeners heard last.
   */
  private lastStatus: PlayerStatus = 'idle';

  /**
   * @internal A page gets its player from `createBrowserPlayer`, which composes the parts.
   */
  public constructor(private readonly parts: PlayerParts) {
    this.loop = new FrameLoop(this.tick);
    // A hidden tab or an offscreen frame gets no animation frames: the sound's end ticks the
    // session itself, so the recording still ends, and loops, there.
    parts.host.audio.addEventListener('ended', this.tick);
    this.sound = new PlayerSound(parts.host.audio, this.outbox);
    const { canvas } = parts.host;
    this.viewing = new PlayerView(this.outbox, () => cssSizeOf(canvas));
  }

  public get status(): PlayerStatus {
    return statusOf(this.phase);
  }

  public get metadata(): PlayerMetadata | undefined {
    return this.loaded?.opened.metadata;
  }

  public get currentTime(): number {
    return this.loaded?.pipeline.session.currentTime ?? seconds(0);
  }

  public get duration(): number {
    return this.loaded?.opened.duration ?? seconds(0);
  }

  /**
   * False while playing or holding for frames, as a media element's `paused`.
   */
  public get isPaused(): boolean {
    return !isFlowing(this.loaded?.pipeline.session.state);
  }

  public get view(): ViewAngles {
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
    if (this.isDisposed) return;
    const loading = this.outbox.change(() => {
      this.unload();
      const next = loadingPhase();
      this.phase = next;
      this.announceStatus();
      return next;
    });
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
    this.outbox.change(() => {
      this.release();
      this.announceStatus();
    });
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

  /**
   * Seeks exactly to `time` seconds; while a recording is loading, before one is, or after its
   * playback failed, the next one starts there, as a media element's default playback start
   * position has it.
   */
  public seek(time: number): void {
    ensureFinite(time, 'time');
    const session = this.loaded?.pipeline.session;
    if (session && session.state !== 'error') session.seek(seconds(time));
    else this.pendingStartTime = seconds(time);
  }

  /**
   * Seeks to the key frame at or before `time` seconds: quick to show while a seek bar is dragged.
   */
  public async scrub(time: number): Promise<void> {
    ensureFinite(time, 'time');
    await this.loaded?.pipeline.session.scrub(seconds(time));
  }

  public setView(view: ViewAngles): void {
    this.viewing.set(viewStateOf(view));
  }

  /**
   * Points the normal view at `yaw` and `pitch`, in degrees: yaw positive to the right, pitch
   * positive up.
   */
  public lookAt(yaw: number, pitch: number): void {
    ensureFinite(yaw, 'yaw');
    ensureFinite(pitch, 'pitch');
    this.viewing.lookAt(degrees(yaw), degrees(pitch));
  }

  /**
   * The viewer dragged the picture by `delta` CSS pixels across the canvas.
   */
  public pan(delta: DragDelta): void {
    this.viewing.pan(delta);
  }

  /**
   * The viewer turned by the given angles in degrees, as the arrow keys do.
   */
  public turn(yawDelta: number, pitchDelta: number): void {
    ensureFinite(yawDelta, 'yaw turn');
    ensureFinite(pitchDelta, 'pitch turn');
    this.viewing.turn(degrees(yawDelta), degrees(pitchDelta));
  }

  /**
   * Zooms by `steps` (positive zooms in) toward `focus`, a point of the canvas as fractions of its
   * size; about the centre when none is given.
   */
  public zoom(steps: number, focus?: ScreenPoint): void {
    ensureFinite(steps, 'zoom steps');
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
    ensureFinite(volume, 'volume');
    this.sound.setVolume(volume);
  }

  public setMuted(isMuted: boolean): void {
    this.sound.setMuted(isMuted);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.unload();
    this.parts.host.audio.removeEventListener('ended', this.tick);
    this.sound.dispose();
    this.events.removeAll();
  }

  private readonly tick = (): void => {
    this.loaded?.pipeline.session.tick();
  };

  /**
   * Whatever it ends in: a failure is the load's to report, and `play` reads it from the phase.
   */
  private async loadInProgress(): Promise<void> {
    if (this.phase.kind === 'loading') await this.phase.settled.promise;
  }

  private get loaded(): LoadedRecording | undefined {
    return this.phase.kind === 'loaded' ? this.phase.loaded : undefined;
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
    this.outbox.change(() => {
      this.attach(loaded, loading.controller);
      this.startAtPendingTime(loaded);
      if (options.preload !== false) loaded.pipeline.session.preload();
    });
    // A listener of `ready` may have loaded something else: whether that plays is its own call.
    if (options.autoplay && this.loaded === loaded) await this.autoplay();
  }

  private startAtPendingTime(loaded: LoadedRecording): void {
    const time = this.pendingStartTime;
    this.pendingStartTime = undefined;
    if (time !== undefined) loaded.pipeline.session.seek(time);
  }

  private attach(loaded: LoadedRecording, controller: AbortController): void {
    this.phase = { kind: 'loaded', loaded, controller };
    this.viewing.attach(loaded.pipeline.renderer);
    const { session } = loaded.pipeline;
    this.picture.attach(loaded.pipeline);
    this.relay.attach(session);
    this.loop.start();
    this.announceStatus();
    for (const warning of loaded.warnings) this.outbox.emit('warning', warning);
    this.outbox.emit('ready', loaded.opened.metadata);
  }

  /**
   * A refused start leaves the recording loaded and paused: a warning, never a failed load.
   */
  private async autoplay(): Promise<void> {
    try {
      await this.play();
    } catch (error) {
      this.outbox.emit(
        'warning',
        hasErrorCode(error, 'playback-blocked')
          ? { code: 'autoplay-blocked', message: 'playback waits for a user gesture' }
          : { code: 'playback-failed', message: `autoplay failed: ${messageOf(error)}` },
      );
    }
  }

  private onEnded(): void {
    this.outbox.emit('ended', undefined);
    if (this.isLoopingValue) void this.replay();
  }

  private async replay(): Promise<void> {
    try {
      await this.play();
    } catch (error) {
      this.outbox.emit('warning', {
        code: 'playback-failed',
        message: `the loop could not restart playback: ${messageOf(error)}`,
      });
    }
  }

  /**
   * Lets go of whatever is loading or loaded, announcing nothing.
   */
  private release(): void {
    const previous = this.phase;
    this.phase = IDLE;
    if (previous.kind === 'loading') previous.controller.abort();
    this.loop.stop();
    this.relay.detach();
    this.viewing.attach(undefined);
    this.picture.attach(undefined);
    if (previous.kind !== 'loaded') return;
    previous.loaded.dispose();
    previous.controller.abort();
  }

  private failWith(error: unknown): GyroViewError {
    const failure =
      error instanceof GyroViewError
        ? error
        : new GyroViewError('invariant-violation', 'the player failed unexpectedly', {
            cause: error,
          });
    this.outbox.change(() => {
      // Lets go of what the failed load holds: its reads, which only this abort ends, and the
      // recording, when it failed after attaching it.
      this.release();
      this.phase = { kind: 'failed', failure };
      this.announceStatus();
      this.outbox.emit('error', failure);
    });
    return failure;
  }

  /**
   * Announces the status the phase gives now, heard once for each change: a status announced
   * again before listeners heard the other one in between is heard once.
   */
  private announceStatus(): void {
    const { status } = this;
    this.outbox.post(() => {
      if (status === this.lastStatus) return;
      this.lastStatus = status;
      this.events.emit('statuschange', status);
    });
  }
}
