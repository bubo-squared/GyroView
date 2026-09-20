import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  clampView,
  DEFAULT_VIEW,
  GyroViewError,
  lookAt,
  seconds,
  stabilizerFor,
  TypedEmitter,
  zoomView,
  type Degrees,
  type PlayerState,
  type Presentation,
  type Seconds,
  type StabilizationMode,
  type ViewState,
} from '@gyroview/core';

import { FrameLoop, type FrameScheduler } from './FrameLoop';
import type { PlayerEvents, PlayerStatus } from './PlayerEvents';
import { transportEventsFor } from './transportEvents';
import { Viewport } from './Viewport';
import { buildPipeline, type Pipeline, type PipelineHost } from '../composition/buildPipeline';
import { hasErrorCode, isAbortError } from '../composition/errorCodes';
import type { OpenedRecording } from '../composition/OpenedRecording';
import { openRecording } from '../composition/openRecording';
import type { RecordingPorts } from '../composition/ports';
import type { PlayerMetadata } from '../PlayerMetadata';
import type { PlayerSource } from '../PlayerSource';

export interface PlayerParts {
  readonly host: PipelineHost;
  readonly ports: RecordingPorts<VideoFrame>;
  readonly scheduler?: FrameScheduler;
}

export interface LoadOptions {
  readonly view?: ViewState;
  readonly stabilization?: StabilizationMode;
  /**
   * Start as soon as the recording is ready; a refusal by the autoplay policy is a warning.
   */
  readonly autoplay?: boolean;
}

/**
 * What is running for the loaded recording.
 */
interface Loaded {
  readonly opened: OpenedRecording;
  readonly pipeline: Pipeline;
  readonly viewport: Viewport;
}

const DEFAULT_STABILIZATION: StabilizationMode = 'lock';

/**
 * Headless player: the facade every host (the element, the embed bridge) drives. Owns one
 * loaded recording at a time, relays the session's events in media-element terms and keeps
 * the view and stabilization settings across loads. Everything DOM it touches is handed in.
 */
export class Player {
  public readonly events = new TypedEmitter<PlayerEvents>();
  private readonly loop: FrameLoop;
  private loaded: Loaded | undefined;
  private loading: AbortController | undefined;
  private failure: GyroViewError | undefined;
  private viewState: ViewState = DEFAULT_VIEW;
  private stabilizationMode: StabilizationMode = DEFAULT_STABILIZATION;
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

  public get isPaused(): boolean {
    return this.loaded?.pipeline.session.state !== 'playing';
  }

  public get view(): ViewState {
    return this.viewState;
  }

  public get stabilization(): StabilizationMode {
    return this.stabilizationMode;
  }

  public get isLooping(): boolean {
    return this.isLoopingValue;
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
    this.applyOptions(options);
    this.setStatus('loading');
    try {
      const loaded = await this.open(source, controller.signal);
      this.loading = undefined;
      this.attach(loaded);
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
    if (loaded) {
      loaded.viewport.dispose();
      loaded.pipeline.dispose();
      loaded.opened.dispose();
    }
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

  public setView(view: ViewState): void {
    this.viewState = clampView(view);
    this.loaded?.pipeline.renderer.setView(this.viewState);
    this.events.emit('viewchange', this.viewState);
  }

  public lookAt(yaw: Degrees, pitch: Degrees): void {
    this.setView(lookAt(this.viewState, yaw, pitch));
  }

  public zoom(steps: number): void {
    this.setView(zoomView(this.viewState, steps));
  }

  public resetView(): void {
    this.setView({ ...DEFAULT_VIEW, projection: this.viewState.projection });
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

  private applyOptions(options: LoadOptions): void {
    if (options.view) this.viewState = clampView(options.view);
    if (options.stabilization) this.stabilizationMode = options.stabilization;
  }

  private async open(source: PlayerSource, signal: AbortSignal): Promise<Loaded> {
    const opened = await openRecording(source, this.parts.ports, signal);
    try {
      const pipeline = await buildPipeline({
        opened,
        host: this.parts.host,
        decoderPort: this.parts.ports.decoderPort,
        view: this.viewState,
        onPresent: (presentation): void => {
          this.onPresent(presentation);
        },
      });
      signal.throwIfAborted();
      return {
        opened,
        pipeline,
        viewport: new Viewport(this.parts.host.canvas, pipeline.renderer),
      };
    } catch (error) {
      opened.dispose();
      throw error;
    }
  }

  private attach(loaded: Loaded): void {
    this.loaded = loaded;
    const { session } = loaded.pipeline;
    loaded.pipeline.stabilizing?.setStabilizer(stabilizerFor(this.stabilizationMode));
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

  private async autoplay(): Promise<void> {
    try {
      await this.play();
    } catch (error) {
      if (!hasErrorCode(error, 'playback-blocked')) throw error;
      this.events.emit('warning', 'autoplay was blocked; playback waits for a user gesture');
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
    if (name === 'play' || name === 'pause') this.events.emit(name, undefined);
    else this.events.emit(name, this.currentTime);
  }

  private onEnded(): void {
    this.events.emit('ended', undefined);
    if (this.isLoopingValue) void this.replay();
  }

  private async replay(): Promise<void> {
    try {
      await this.play();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.events.emit('warning', `the loop could not restart playback: ${reason}`);
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
    sinkOf(loaded.pipeline).present(lastPresentation);
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

function sinkOf(pipeline: Pipeline): Pick<ThreeFrameRenderer, 'present'> {
  return pipeline.stabilizing ?? pipeline.renderer;
}
