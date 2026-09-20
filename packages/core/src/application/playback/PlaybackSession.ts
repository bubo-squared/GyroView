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
import { Deferred } from '../../shared/async/Deferred';
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
 * Pairs queued before the clock (re)starts, so playback does not stall on its first frames.
 */
const PRIMING_PAIRS = 2;
/**
 * A shown frame this far behind the clock, with nothing decoded to follow it, means the decoders
 * have fallen behind: several frames at any frame rate, well beyond jitter.
 */
const STARVATION_LAG_SECONDS = 0.25;

/**
 * Use case: drives one recording through the decode pipeline in step with the clock and hands
 * frame pairs to the sink. The host calls {@link tick} once per animation frame; everything
 * else is event-driven. Sound follows the picture: the clock waits in `buffering` until frames
 * are ready, on starting, after a seek and whenever decoding falls behind.
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
  /**
   * The `play` call waiting for the clock to start once frames are ready.
   */
  private startAttempt: Deferred<void> | undefined;

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
   * Starts or resumes, resolving once the clock runs. A paused session keeps its pipeline and
   * the pairs it prefetched; a fresh or ended one starts decoding anew and waits in `buffering`
   * for the first pairs. Rejects, back in `paused`, when the clock refuses to start (autoplay
   * policy); the host then waits for a user gesture. Pausing meanwhile resolves quietly.
   */
  public async play(): Promise<void> {
    if (this.machine.state === 'playing') return;
    if (this.machine.state === 'buffering') {
      await this.startAttempt?.promise;
      return;
    }
    if (this.machine.state === 'ended') this.seek(seconds(0));
    if (!this.machine.canTransitionTo('buffering')) return;
    if (!this.pipeline) this.startPipeline(this.parts.clock.currentTime);
    if (this.isPrimed()) {
      this.setState('playing');
      await this.startClock();
      return;
    }
    this.setState('buffering');
    const attempt = new Deferred<void>();
    this.startAttempt = attempt;
    await attempt.promise;
  }

  public pause(): void {
    if (!this.machine.canTransitionTo('paused')) return;
    this.parts.clock.pause();
    this.setState('paused');
    this.settleStartAttempt();
  }

  /**
   * Pause and return to the beginning, showing the first frame again on the next tick.
   */
  public stop(): void {
    this.pause();
    this.seek(seconds(0));
  }

  /**
   * Jumps to a time. A playing session resumes through `buffering` once the frames there have
   * been decoded; a paused one shows the target frame and stays paused.
   */
  public seek(time: Seconds): void {
    if (this.machine.isOneOf('disposed', 'error')) return;
    const target = seconds(Math.min(Math.max(time, 0), this.parts.duration));
    const shouldResume = this.machine.isOneOf('playing', 'buffering');
    this.setState('seeking');
    this.parts.clock.pause();
    this.parts.clock.seek(target);
    this.stopPipeline();
    this.startPipeline(target);
    this.setState(shouldResume ? 'buffering' : 'paused');
    this.events.emit('timeupdate', target);
  }

  /**
   * Seeks to the key frame at or before `time`: what a dragged seek bar can show at once,
   * without decoding a whole group of pictures first.
   */
  public async scrub(time: Seconds): Promise<void> {
    const [track] = this.parts.lensTracks;
    if (!track || this.machine.isOneOf('disposed', 'error')) return;
    const target = seconds(Math.min(Math.max(time, 0), this.parts.duration));
    const keyPacket = await track.keyPacketAt(target);
    if (this.machine.isOneOf('disposed', 'error')) return;
    this.seek(keyPacket?.timestamp ?? target);
  }

  /**
   * Starts decoding at the current time without playing, so the frame there shows while the
   * session is still `ready`.
   */
  public preload(): void {
    if (this.pipeline || this.machine.state !== 'ready') return;
    this.startPipeline(this.parts.clock.currentTime);
  }

  /**
   * Presents the frame pair due at the clock's time, if a newer one has arrived, and follows
   * the clock to the end, into `buffering` or into failure.
   */
  public tick(): void {
    if (this.machine.isOneOf('disposed', 'error')) return;
    const { failure } = this.parts.clock;
    if (failure) {
      this.fail(failure);
      return;
    }
    const now = this.parts.clock.currentTime;
    const hasShown = this.presentDue(now);
    if (this.machine.state === 'playing') this.followClock(now, hasShown);
  }

  public dispose(): void {
    if (this.machine.state === 'disposed') return;
    this.stopPipeline();
    if (this.presented) closeFramePair(this.presented);
    this.presented = undefined;
    this.parts.clock.pause();
    this.setState('disposed');
    this.settleStartAttempt();
    this.events.removeAll();
  }

  private presentDue(now: Seconds): boolean {
    const pair = this.queue.takePairAt(now);
    if (pair) this.present(pair, now);
    return pair !== undefined;
  }

  private followClock(now: Seconds, hasShown: boolean): void {
    if (!hasShown && this.isStarved(now)) {
      this.parts.clock.pause();
      this.setState('buffering');
      return;
    }
    this.events.emit('timeupdate', now);
    if (this.hasDecodedToEnd && this.isPlayedOut(now)) this.end();
  }

  /**
   * Enough frames are decoded to start moving: a couple queued, or the run is over and what is
   * left is already there.
   */
  private isPrimed(): boolean {
    return this.hasDecodedToEnd || this.queue.length >= Math.min(PRIMING_PAIRS, this.queueCapacity);
  }

  /**
   * Nothing is due, nothing is queued, the run is not over, and the frame on screen is well
   * behind the clock: the decoders cannot keep up.
   */
  private isStarved(now: Seconds): boolean {
    const isWaitingOnDecoders = this.queue.length === 0 && !this.hasDecodedToEnd;
    const lag = now - (this.presented?.timestamp ?? -Infinity);
    return isWaitingOnDecoders && lag > STARVATION_LAG_SECONDS;
  }

  /**
   * Called as pairs arrive and when a run ends: the moment `buffering` has what it waits for.
   */
  private resumeIfPrimed(): void {
    if (this.machine.state === 'buffering' && this.isPrimed()) void this.resume();
  }

  /**
   * Leaves `buffering` for `playing` and starts the clock; a refusal (only possible before the
   * first start) lands `paused` and is reported to the waiting `play`.
   */
  private async resume(): Promise<void> {
    const attempt = this.startAttempt;
    this.startAttempt = undefined;
    this.setState('playing');
    try {
      await this.startClock();
      attempt?.resolve();
    } catch (error) {
      attempt?.reject(error);
    }
  }

  private async startClock(): Promise<void> {
    try {
      await this.parts.clock.start();
    } catch (error) {
      if (this.machine.state === 'playing') this.setState('paused');
      throw error;
    }
  }

  private settleStartAttempt(): void {
    this.startAttempt?.resolve();
    this.startAttempt = undefined;
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
    const queue = new FramePairQueue<Handle>(this.queueCapacity, () => {
      if (queue === this.queue) this.resumeIfPrimed();
    });
    this.queue = queue;
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
      if (this.pipeline !== pipeline) return;
      this.hasDecodedToEnd = report.hasReachedEnd;
      this.resumeIfPrimed();
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
    this.settleStartAttempt();
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
