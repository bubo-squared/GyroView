import { closeFramePair, type FramePair } from './FramePair';
import { FramePairQueue } from './FramePairQueue';
import {
  LensDecodePipeline,
  type DecodePipelineOptions,
  type DecodeRunReport,
} from './LensDecodePipeline';
import type { FrameTimes } from '../../domain/motion/timing/FrameTimes';
import { PlayerStateMachine, type PlayerState } from '../../domain/playback/PlayerState';
import type { VideoTrackReader } from '../../ports/Demuxer';
import type { FrameSink } from '../../ports/FrameSink';
import type { PlaybackClock } from '../../ports/PlaybackClock';
import type { VideoDecoderPort } from '../../ports/VideoDecoderPort';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { TypedEmitter } from '../../shared/events/TypedEmitter';
import { seconds, type Seconds } from '../../shared/units/time';

export interface PlaybackSessionEvents extends Record<string, unknown> {
  readonly statechange: PlayerState;
  readonly timeupdate: Seconds;
  readonly ended: undefined;
  readonly error: GyroViewError;
}

/**
 * What a session works with. The session borrows every part: the composition root that opened
 * the clock and the sink disposes them after the session, the session only pauses the clock.
 */
export interface PlaybackSessionParts<Handle> {
  /**
   * One reader per lens, in lens order.
   */
  readonly lensTracks: readonly VideoTrackReader[];
  readonly decoderPort: VideoDecoderPort<Handle>;
  readonly clock: PlaybackClock;
  readonly sink: FrameSink<Handle>;
  readonly duration: Seconds;
  /**
   * Known when the recording carries timing records; lets the sink know which frame it shows.
   */
  readonly frameTimes: FrameTimes | undefined;
  readonly pipeline: DecodePipelineOptions;
  /**
   * Decoded pairs kept ahead of the playhead; default 4.
   */
  readonly queueCapacity?: number;
}

const DEFAULT_QUEUE_CAPACITY = 4;

/**
 * Use case: drives one recording through the decode pipeline in step with the clock and hands
 * frame pairs to the sink. The host calls {@link tick} once per animation frame; everything
 * else is event-driven.
 */
export class PlaybackSession<Handle = unknown> {
  public readonly events = new TypedEmitter<PlaybackSessionEvents>();
  private readonly machine = new PlayerStateMachine();
  private readonly queueCapacity: number;
  /**
   * One queue per pipeline run: a superseded run's late frames land in its own closed queue and
   * are dropped, never presented as if they belonged to the run that replaced it.
   */
  private queue: FramePairQueue<Handle>;
  private pipeline: LensDecodePipeline<Handle> | undefined;
  private presented: FramePair<Handle> | undefined;
  private hasDecodedToEnd = false;

  public constructor(private readonly parts: PlaybackSessionParts<Handle>) {
    this.queueCapacity = parts.queueCapacity ?? DEFAULT_QUEUE_CAPACITY;
    this.queue = new FramePairQueue<Handle>(this.queueCapacity);
  }

  public get state(): PlayerState {
    return this.machine.state;
  }

  public get currentTime(): Seconds {
    return this.parts.clock.currentTime;
  }

  public get duration(): Seconds {
    return this.parts.duration;
  }

  /**
   * Starts or resumes. A paused session keeps its pipeline and the pairs it prefetched; a fresh
   * or ended one starts decoding anew. Rejects, back in `paused`, when the clock refuses to
   * start (autoplay policy); the host then waits for a user gesture.
   */
  public async play(): Promise<void> {
    if (!this.machine.canTransitionTo('playing')) return;
    if (this.machine.state === 'ended') this.seek(seconds(0));
    this.setState('playing');
    if (!this.pipeline) this.startPipeline(this.parts.clock.currentTime);
    try {
      await this.parts.clock.start();
    } catch (error) {
      if (this.machine.state === 'playing') this.setState('paused');
      throw error;
    }
  }

  public pause(): void {
    if (!this.machine.canTransitionTo('paused')) return;
    this.parts.clock.pause();
    this.setState('paused');
  }

  /**
   * Pause and return to the beginning, showing the first frame again on the next tick.
   */
  public stop(): void {
    this.pause();
    this.seek(seconds(0));
  }

  public seek(time: Seconds): void {
    if (this.machine.isOneOf('disposed', 'error')) return;
    const target = seconds(Math.min(Math.max(time, 0), this.parts.duration));
    const resumeTo: PlayerState = this.machine.state === 'playing' ? 'playing' : 'paused';
    this.setState('seeking');
    this.parts.clock.seek(target);
    this.stopPipeline();
    this.startPipeline(target);
    this.setState(resumeTo);
    this.events.emit('timeupdate', target);
  }

  /**
   * Presents the frame pair due at the clock's time, if a newer one has arrived, and follows
   * the clock to the end or into failure.
   */
  public tick(): void {
    if (this.machine.isOneOf('disposed', 'error')) return;
    const { clock } = this.parts;
    if (clock.failure) {
      this.fail(clock.failure);
      return;
    }
    const now = clock.currentTime;
    const pair = this.queue.takePairAt(now);
    if (pair) this.present(pair, now);
    if (this.machine.state !== 'playing') return;
    this.events.emit('timeupdate', now);
    if (this.hasDecodedToEnd && this.isPlayedOut(now)) this.end();
  }

  public dispose(): void {
    if (this.machine.state === 'disposed') return;
    this.stopPipeline();
    if (this.presented) closeFramePair(this.presented);
    this.presented = undefined;
    this.parts.clock.pause();
    this.setState('disposed');
    this.events.removeAll();
  }

  /**
   * Everything decoded has been shown, or the clock's own media ran out first (an audio track
   * a few frames shorter than the video), in which case the remaining pairs are unreachable.
   */
  private isPlayedOut(now: Seconds): boolean {
    return this.parts.clock.hasEnded || (this.queue.length === 0 && now >= this.parts.duration);
  }

  private present(pair: FramePair<Handle>, mediaTime: Seconds): void {
    if (this.presented) closeFramePair(this.presented);
    this.presented = pair;
    this.parts.sink.present({
      pair,
      mediaTime,
      frameIndex: this.parts.frameTimes?.frameIndexAt(pair.timestamp),
    });
  }

  private startPipeline(from: Seconds): void {
    this.hasDecodedToEnd = false;
    this.queue = new FramePairQueue<Handle>(this.queueCapacity);
    const pipeline = new LensDecodePipeline<Handle>(
      this.parts.lensTracks,
      this.parts.decoderPort,
      this.parts.pipeline,
    );
    this.pipeline = pipeline;
    void this.followRun(pipeline, pipeline.run(from, this.queue));
  }

  /**
   * A run that was replaced by a seek reports to nobody: only the current run may end or fail
   * the session.
   */
  private async followRun(
    pipeline: LensDecodePipeline<Handle>,
    run: Promise<DecodeRunReport>,
  ): Promise<void> {
    try {
      const report = await run;
      if (this.pipeline === pipeline) this.hasDecodedToEnd = report.hasReachedEnd;
    } catch (error) {
      if (this.pipeline === pipeline) this.fail(error);
    }
  }

  private stopPipeline(): void {
    this.pipeline?.abort();
    this.pipeline = undefined;
    this.queue.close();
  }

  private end(): void {
    if (!this.machine.canTransitionTo('ended')) return;
    this.parts.clock.pause();
    this.setState('ended');
    this.events.emit('ended', undefined);
  }

  private fail(error: unknown): void {
    if (!this.machine.canTransitionTo('error')) return;
    this.parts.clock.pause();
    this.stopPipeline();
    this.setState('error');
    this.events.emit(
      'error',
      error instanceof GyroViewError
        ? error
        : new GyroViewError('decode', 'playback failed', { cause: error }),
    );
  }

  private setState(next: PlayerState): void {
    this.machine.transitionTo(next);
    this.events.emit('statechange', next);
  }
}
