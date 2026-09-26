import { closeFramePair, type FramePair } from '../../ports/FramePair';
import { DecodeRun, type DecodeRunParts } from './DecodeRun';
import { isFlowing, PlayerStateMachine, type PlayerState } from '../../domain/playback/PlayerState';
import type { FrameSink, Presentation } from '../../ports/FrameSink';
import type { PlaybackClock } from '../../ports/PlaybackClock';
import { Deferred } from '../../shared/async/Deferred';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { TypedEmitter } from '../../shared/events/TypedEmitter';
import { seconds, type Seconds } from '../../shared/units/time';

export interface PlaybackSessionEvents {
  readonly statechange: PlayerState;
  readonly timeupdate: Seconds;
  /**
   * The sink has drawn a new pair; the media time it was drawn at.
   */
  readonly present: Seconds;
  readonly ended: undefined;
  readonly error: GyroViewError;
}

/**
 * What a session works with. The session borrows every part: the composition root that opened
 * the clock and the sink disposes them after the session, the session only pauses the clock.
 */
export interface PlaybackSessionParts<Handle> extends DecodeRunParts<Handle> {
  readonly clock: PlaybackClock;
  readonly sink: FrameSink<Handle>;
  readonly duration: Seconds;
}

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
 * This much media time between two playing ticks means the ticks stopped while the clock ran on
 * (a hidden tab or an offscreen frame gets no animation frames); decoding the gap would replay it
 * at decode speed, so the run starts again at the clock's time. Ticks come with every animation
 * frame, a few hundredths of a second apart at the slowest.
 */
const STOPPED_TICKS_SECONDS = 1;
/**
 * How much media time passes between two `timeupdate`s while playing: the slowest cadence of a
 * media element's, often enough for a seek bar and cheap to relay across `postMessage`.
 */
const TIME_UPDATE_INTERVAL_SECONDS = 0.25;

/**
 * Use case: drives one recording through the decode pipeline in step with the clock and hands
 * frame pairs to the sink. The host calls {@link tick} once per animation frame; everything
 * else is event-driven. Sound follows the picture: the clock waits in `buffering` until frames
 * are ready, on starting, after a seek and whenever decoding falls behind.
 */
export class PlaybackSession<Handle = unknown> {
  public readonly events = new TypedEmitter<PlaybackSessionEvents>();
  private readonly machine = new PlayerStateMachine();
  /**
   * The decode under way, if any: one per start or seek, replaced whole.
   */
  private run: DecodeRun<Handle> | undefined;
  /**
   * The pair on screen, kept open until the next one replaces it.
   */
  private presented: Presentation<Handle> | undefined;
  /**
   * The time the last `timeupdate` announced.
   */
  private announcedTime: Seconds | undefined;
  /**
   * The `play` call waiting for the clock to start once frames are ready.
   */
  private startAttempt: Deferred<void> | undefined;
  /**
   * The clock's time at the last tick while playing, on the timeline of the current run.
   */
  private previousPlayingTick: Seconds | undefined;

  public constructor(private readonly parts: PlaybackSessionParts<Handle>) {}

  public get state(): PlayerState {
    return this.machine.state;
  }

  public get currentTime(): Seconds {
    return this.parts.clock.currentTime;
  }

  /**
   * Starts or resumes, resolving once the clock runs. A paused session keeps its pipeline and
   * the pairs it prefetched; a fresh one starts decoding anew, and an ended one or one paused at
   * the end starts over from the beginning, and waits in `buffering` for the first pairs.
   * Rejects, back in `paused`, when the clock refuses to start (autoplay policy); the host then
   * waits for a user gesture. Pausing meanwhile, a listener's pause included, resolves quietly.
   */
  public async play(): Promise<void> {
    if (this.machine.state === 'playing') return;
    if (this.machine.state === 'buffering') {
      await this.startAttempt?.promise;
      return;
    }
    if (this.isAtTheEnd()) this.seek(seconds(0));
    if (!this.machine.canTransitionTo('buffering')) return;
    if (!this.run) this.startRun(this.parts.clock.currentTime);
    await (this.isPrimed() ? this.startNow() : this.startOncePrimed());
  }

  /**
   * Stops the clock, whatever the state says: a listener may have paused the session while it
   * was starting it.
   */
  public pause(): void {
    this.parts.clock.pause();
    if (!this.machine.canTransitionTo('paused')) return;
    this.setState('paused');
    this.announceTime(this.parts.clock.currentTime);
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
    const wasFlowing = isFlowing(this.machine.state);
    this.setState('seeking');
    if (this.machine.isOneOf('disposed', 'error')) return;
    this.parts.clock.pause();
    this.parts.clock.seek(target);
    this.startRun(target);
    // A listener that paused during `seeking` keeps the session paused.
    if (this.isIn('seeking')) this.setState(wasFlowing ? 'buffering' : 'paused');
    this.announceTime(target);
  }

  /**
   * Seeks to the key frame at or before `time`: what a dragged seek bar can show at once,
   * without decoding a whole group of pictures first.
   */
  public async scrub(time: Seconds): Promise<void> {
    const [track] = this.parts.frameSources;
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
    if (this.run || this.machine.state !== 'ready') return;
    this.startRun(this.parts.clock.currentTime);
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
    if (this.haveTicksStopped(now)) {
      this.restartAt(now);
      return;
    }
    this.presentDue(now);
    if (this.machine.state === 'playing') this.followClock(now);
  }

  /**
   * Hands the pair on screen to the sink again, so a change in how it is drawn shows while the
   * picture stands still; while playing, the next pair shows it soon enough.
   */
  public redraw(): void {
    if (!this.presented || this.machine.state === 'playing') return;
    this.parts.sink.present(this.presented);
  }

  public dispose(): void {
    if (this.machine.state === 'disposed') return;
    this.abortRun();
    if (this.presented) closeFramePair(this.presented.pair);
    this.presented = undefined;
    this.parts.clock.pause();
    this.setState('disposed');
    this.settleStartAttempt();
    this.events.removeAll();
  }

  private async startNow(): Promise<void> {
    this.setState('playing');
    if (this.isIn('playing')) await this.startClock();
  }

  /**
   * The attempt exists before `buffering` is announced, so a listener's pause settles it.
   */
  private async startOncePrimed(): Promise<void> {
    const attempt = new Deferred<void>();
    this.startAttempt = attempt;
    this.setState('buffering');
    await attempt.promise;
  }

  /**
   * Whether the session is in `state` now: a listener of the last change may have moved it on.
   */
  private isIn(state: PlayerState): boolean {
    return this.machine.state === state;
  }

  private presentDue(now: Seconds): void {
    const pair = this.run?.takePairAt(now);
    if (pair) this.present(pair, now);
  }

  private followClock(now: Seconds): void {
    if (this.isStoppedFromOutside()) {
      this.setState('paused');
      this.announceTime(now);
      return;
    }
    if (this.isStarved(now)) {
      this.parts.clock.pause();
      this.setState('buffering');
      return;
    }
    if (this.isTimeUpdateDue(now)) this.announceTime(now);
    if (this.isPlayedOut(now)) this.end();
  }

  /**
   * Whether the clock ran on for a while since the last playing tick, which the ticks missed.
   * An ended clock is left to end the session.
   */
  private haveTicksStopped(now: Seconds): boolean {
    const previous = this.previousPlayingTick;
    const isPlaying = this.machine.state === 'playing';
    this.previousPlayingTick = isPlaying ? now : undefined;
    const gap = previous === undefined ? 0 : now - previous;
    return isPlaying && gap > STOPPED_TICKS_SECONDS && !this.parts.clock.hasEnded;
  }

  /**
   * Decodes anew from the clock's time, holding the clock until the frames there are ready:
   * the seek a page would take for the viewer's is not needed, the clock is where it must be.
   */
  private restartAt(now: Seconds): void {
    this.parts.clock.pause();
    this.startRun(now);
    this.setState('buffering');
  }

  /**
   * Ended, or paused at the end: a play from there starts over, as a media element does.
   */
  private isAtTheEnd(): boolean {
    const { clock, duration } = this.parts;
    const isAtEndOfMedia = clock.hasEnded || clock.currentTime >= duration;
    return this.machine.state === 'ended' || isAtEndOfMedia;
  }

  private isTimeUpdateDue(now: Seconds): boolean {
    const { announcedTime } = this;
    return (
      announcedTime === undefined || Math.abs(now - announcedTime) >= TIME_UPDATE_INTERVAL_SECONDS
    );
  }

  private announceTime(time: Seconds): void {
    this.announcedTime = time;
    this.events.emit('timeupdate', time);
  }

  /**
   * The platform stopped the clock by itself (media keys, an audio interruption) while playing:
   * the session follows, so the next `play` starts it again.
   */
  private isStoppedFromOutside(): boolean {
    const { clock } = this.parts;
    return !clock.isRunning && !clock.hasEnded;
  }

  /**
   * Enough frames are decoded to start moving: a couple queued, or the run is over and what is
   * left is already there.
   */
  private isPrimed(): boolean {
    const { run } = this;
    const primingPairs = Math.min(PRIMING_PAIRS, this.parts.queueCapacity);
    return run !== undefined && (run.hasReachedEnd || run.queuedPairs >= primingPairs);
  }

  /**
   * Nothing is queued, the run is not over, and the frame on screen is well behind the clock:
   * the decoders cannot keep up, even when each tick still finds a pair to show.
   */
  private isStarved(now: Seconds): boolean {
    const { run } = this;
    const isWaitingOnDecoders = run?.queuedPairs === 0 && !run.hasReachedEnd;
    const lag = now - (this.presented?.pair.timestamp ?? -Infinity);
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
    if (!this.isIn('playing')) {
      attempt?.resolve();
      return;
    }
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
   * The clock's own media ran out (an audio track shorter than the video: the pairs after it are
   * unreachable, and the decoders may wait for room to decode them forever), or everything
   * decoded to the end has been shown and the clock passed the duration.
   */
  private isPlayedOut(now: Seconds): boolean {
    if (this.parts.clock.hasEnded) return true;
    const isDrained = this.run?.hasReachedEnd === true && this.run.queuedPairs === 0;
    return isDrained && now >= this.parts.duration;
  }

  private present(pair: FramePair<Handle>, mediaTime: Seconds): void {
    if (this.presented) closeFramePair(this.presented.pair);
    this.presented = { pair, mediaTime };
    this.parts.sink.present(this.presented);
    this.events.emit('present', mediaTime);
  }

  /**
   * Replaces the run under way; the one replaced reports to nobody, so only the current run may
   * wake a waiting start, end or fail the session.
   */
  private startRun(from: Seconds): void {
    this.abortRun();
    this.previousPlayingTick = undefined;
    this.run = DecodeRun.start(this.parts, from, {
      onProgress: (): void => {
        this.resumeIfPrimed();
      },
      onFailure: (error): void => {
        this.fail(error);
      },
    });
  }

  private abortRun(): void {
    this.run?.abort();
    this.run = undefined;
  }

  private end(): void {
    if (!this.machine.canTransitionTo('ended')) return;
    this.parts.clock.pause();
    this.setState('ended');
    this.announceTime(this.parts.clock.currentTime);
    this.events.emit('ended', undefined);
  }

  private fail(error: unknown): void {
    if (!this.machine.canTransitionTo('error')) return;
    this.parts.clock.pause();
    this.abortRun();
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
