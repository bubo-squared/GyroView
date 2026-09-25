import {
  GyroViewError,
  seconds,
  stabilizerFor,
  TypedEmitter,
  type Degrees,
  type DragDelta,
  type PlayerState,
  type Presentation,
  type Seconds,
  type StabilizationMode,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';

import { FrameLoop } from './FrameLoop';
import { loadRecording, type LoadedRecording } from './loadRecording';
import type { PlayerEvents, PlayerStatus } from './PlayerEvents';
import type { LoadOptions, PlayerParts } from './PlayerOptions';
import { PlayerView } from './PlayerView';
import { transportEventsFor } from './transportEvents';
import { hasErrorCode, isAbortError, messageOf } from '../composition/errorCodes';
import type { PlayerMetadata } from '../PlayerMetadata';
import type { PlayerSource } from '../PlayerSource';

const DEFAULT_STABILIZATION: StabilizationMode = 'lock';

/**
 * Headless player: the facade every host (the element, the embed bridge) drives. Owns one
 * loaded recording at a time, relays the session's events in media-element terms, and owns the
 * settings (view, view mode, stabilization, gain matching, sound, loop), which carry over from
 * load to load. Everything DOM it touches is handed in.
 */
export class Player {
  public readonly events = new TypedEmitter<PlayerEvents>();
  private readonly loop: FrameLoop;
  private loaded: LoadedRecording | undefined;
  private loading: AbortController | undefined;
  private failure: GyroViewError | undefined;
  private readonly viewing = new PlayerView(this.events);
  private stabilizationMode: StabilizationMode = DEFAULT_STABILIZATION;
  private isGainMatching = true;
  private isLoopingValue = false;
  private lastStatus: PlayerStatus = 'idle';
  private lastSessionState: PlayerState | undefined;
  private lastPresentation: Presentation<VideoFrame> | undefined;

  public constructor(private readonly parts: PlayerParts) {
    this.loop = new FrameLoop(() => {
      this.loaded?.pipeline.session.tick();
    }, parts.scheduler);
  }

  public get status(): PlayerStatus {
    if (this.loading) return 'loading';
    return this.failure ? 'error' : (this.loaded?.pipeline.session.state ?? 'idle');
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
    const state = this.loaded?.pipeline.session.state;
    return state !== 'playing' && state !== 'buffering';
  }

  public get view(): ViewState {
    return this.viewing.current;
  }

  public get viewMode(): ViewMode {
    return this.viewing.viewMode;
  }

  public get stabilization(): StabilizationMode {
    return this.stabilizationMode;
  }

  public get isLooping(): boolean {
    return this.isLoopingValue;
  }

  public get isMatchingGains(): boolean {
    return this.isGainMatching;
  }

  public get volume(): number {
    return this.parts.host.audio.volume;
  }

  public get isMuted(): boolean {
    return this.parts.host.audio.muted;
  }

  /**
   * Replaces whatever was loaded. Resolves once the recording is ready (and started, with
   * `autoplay`); rejects with the failure after reporting it as an `error` event. A load that a
   * newer load or `unload` supersedes resolves quietly.
   */
  public async load(source: PlayerSource, options: LoadOptions = {}): Promise<void> {
    this.unload();
    const controller = new AbortController();
    this.loading = controller;
    this.setStatus('loading');
    try {
      const loaded = await this.open(source, controller.signal);
      // A newer load may have started between the last abort check and here; its parts belong
      // to nobody now.
      if (controller.signal.aborted) {
        loaded.dispose();
        return;
      }
      this.loading = undefined;
      this.attach(loaded);
      if (options.preload !== false) loaded.pipeline.session.preload();
      if (options.autoplay) await this.autoplay();
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      this.loading = undefined;
      throw this.failWith(error);
    }
  }

  public unload(): void {
    this.loading?.abort();
    this.loading = undefined;
    this.failure = undefined;
    this.loop.stop();
    this.lastPresentation = undefined;
    this.lastSessionState = undefined;
    const { loaded } = this;
    this.loaded = undefined;
    this.viewing.attach(undefined);
    loaded?.dispose();
    this.setStatus('idle');
  }

  /**
   * Rejects with `playback-blocked` when the browser wants a user gesture first.
   */
  public async play(): Promise<void> {
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
   * The viewer dragged the picture by `delta` on a viewport `viewportWidth` pixels wide.
   */
  public pan(delta: DragDelta, viewportWidth: number): void {
    this.viewing.pan(delta, viewportWidth);
  }

  /**
   * The viewer turned by the given angles, as the arrow keys do.
   */
  public turn(yawDelta: Degrees, pitchDelta: Degrees): void {
    this.viewing.turn(yawDelta, pitchDelta);
  }

  public zoom(steps: number): void {
    this.viewing.zoom(steps);
  }

  public resetView(): void {
    this.viewing.reset();
  }

  public setViewMode(mode: ViewMode): void {
    this.viewing.setMode(mode);
  }

  public setStabilization(mode: StabilizationMode): void {
    this.stabilizationMode = mode;
    this.loaded?.pipeline.stabilizing?.setStabilizer(stabilizerFor(mode));
    this.refreshPicture();
    this.events.emit('stabilizationchange', mode);
  }

  public setLooping(isLooping: boolean): void {
    this.isLoopingValue = isLooping;
  }

  /**
   * Whether the lenses' exposure is matched along the seam; kept across loads.
   */
  public setGainMatching(isEnabled: boolean): void {
    this.isGainMatching = isEnabled;
    this.loaded?.pipeline.renderer.setGainMatching(isEnabled);
  }

  public setVolume(volume: number): void {
    this.parts.host.audio.volume = Math.min(Math.max(volume, 0), 1);
  }

  public setMuted(isMuted: boolean): void {
    this.parts.host.audio.muted = isMuted;
  }

  public dispose(): void {
    this.unload();
    this.events.removeAll();
  }

  private async open(source: PlayerSource, signal: AbortSignal): Promise<LoadedRecording> {
    return loadRecording({
      source,
      parts: this.parts,
      view: this.viewing.current,
      viewMode: this.viewing.viewMode,
      onPresent: (presentation): void => {
        this.onPresent(presentation);
      },
      signal,
    });
  }

  private attach(loaded: LoadedRecording): void {
    this.loaded = loaded;
    this.viewing.attach(loaded.pipeline.renderer);
    const { session } = loaded.pipeline;
    loaded.pipeline.stabilizing?.setStabilizer(stabilizerFor(this.stabilizationMode));
    loaded.pipeline.renderer.setGainMatching(this.isGainMatching);
    session.events.on('statechange', (state) => {
      this.onSessionState(state);
    });
    session.events.on('timeupdate', (time) => {
      this.events.emit('timeupdate', time);
    });
    session.events.on('ended', () => {
      this.onEnded();
    });
    session.events.on('error', (error) => {
      this.events.emit('error', error);
    });
    this.lastSessionState = session.state;
    this.loop.start();
    this.setStatus(session.state);
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

  private onSessionState(state: PlayerState): void {
    const previous = this.lastSessionState;
    this.lastSessionState = state;
    for (const name of transportEventsFor(previous, state)) {
      this.emitTransport(name);
    }
    this.setStatus(state);
  }

  private emitTransport(name: ReturnType<typeof transportEventsFor>[number]): void {
    if (name === 'seeking' || name === 'seeked') this.events.emit(name, this.currentTime);
    else this.events.emit(name, undefined);
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

  private onPresent(presentation: Presentation<VideoFrame>): void {
    this.lastPresentation = presentation;
    this.events.emit('frame', presentation.mediaTime);
  }

  /**
   * Draws the frame on screen again with the current stabilization, so a mode change is visible
   * while paused. The pair belongs to the session, which keeps it until the next one is shown.
   */
  private refreshPicture(): void {
    const { loaded, lastPresentation } = this;
    if (!loaded || !lastPresentation || loaded.pipeline.session.state === 'playing') return;
    (loaded.pipeline.stabilizing ?? loaded.pipeline.renderer).present(lastPresentation);
  }

  private failWith(error: unknown): GyroViewError {
    const failure =
      error instanceof GyroViewError
        ? error
        : new GyroViewError('invariant-violation', 'the player failed unexpectedly', {
            cause: error,
          });
    this.failure = failure;
    this.setStatus('error');
    this.events.emit('error', failure);
    return failure;
  }

  private setStatus(status: PlayerStatus): void {
    if (status === this.lastStatus) return;
    this.lastStatus = status;
    this.events.emit('statuschange', status);
  }
}
