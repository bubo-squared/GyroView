import { closeFramePair, type FramePair } from '../../ports/FramePair';
import { ClockWatch } from './ClockWatch';
import { SeekOrder } from './SeekOrder';
import { TimeUpdates } from './TimeUpdates';
import { DecodeRun, type DecodeRunParts } from './DecodeRun';
import { PlayerStateMachine, type PlayerState } from '../../domain/playback/PlayerState';
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
  private readonly timeUpdates = new TimeUpdates((time) => {
    this.events.emit('timeupdate', time);
  });
  /**
   * The `play` call waiting for the clock to start once frames are ready.
   */
  private startAttempt: Deferred<void> | undefined;
  private readonly clockWatch = new ClockWatch();
  private readonly seeks = new SeekOrder();

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
    // Taken first: a listener's `play` on `paused` makes an attempt of its own.
    const attempt = this.takeStartAttempt();
    this.setState('paused');
    attempt?.resolve();
    if (this.isIn('paused')) this.timeUpdates.announce(this.parts.clock.currentTime);
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
    const generation = this.seeks.begin(this.machine.state);
    this.moveClockTo(target);
    this.startRun(target);
    if (!this.isIn('seeking')) this.setState('seeking');
    // A listener may have sought again, paused or disposed while `seeking` was announced.
    if (!this.isSeekCurrent(generation)) return;
    if (this.isIn('seeking')) this.setState(this.seeks.resumesPlaying ? 'buffering' : 'paused');
    if (this.isSeekCurrent(generation)) this.timeUpdates.announce(target);
  }

  /**
   * Seeks to the key frame at or before `time`: what a dragged seek bar can show at once,
   * without decoding a whole group of pictures first.
   */
  public async scrub(time: Seconds): Promise<void> {
    const [track] = this.parts.frameSources;
    if (!track || this.machine.isOneOf('disposed', 'error')) return;
    const target = seconds(Math.min(Math.max(time, 0), this.parts.duration));
    const ticket = this.seeks.claimScrub();
    const keyPacket = await track.keyPacketAt(target);
    // A seek or scrub made meanwhile is newer: this scrub lands no more.
    if (!this.seeks.isScrubCurrent(ticket) || this.machine.isOneOf('disposed', 'error')) return;
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
   * the clock: to the end, into `buffering`, into failure, and into a start or a stop the
   * platform made by itself (media keys, an audio interruption).
   */
  public tick(): void {
    if (this.machine.isOneOf('disposed', 'error')) return;
    const { failure } = this.parts.clock;
    if (failure) {
      this.fail(failure);
      return;
    }
    const now = this.parts.clock.currentTime;
    if (this.clockWatch.wasMovedFromOutside(now, this.isIn('playing'))) {
      this.followMoveFromOutside(now);
      return;
    }
    if (this.haveTicksStopped(now)) {
      this.restartAt(now);
      return;
    }
    this.presentDue(now);
    if (this.isIn('playing')) this.followClock(now);
    else if (this.isStartedFromOutside()) void this.followStartFromOutside();
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
    this.enterPlaying();
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
   * Playing from the clock's time now: ticks that never come from here on are missed ticks
   * too, as when playback starts in a hidden tab or an offscreen frame.
   */
  private enterPlaying(): void {
    this.clockWatch.playingFrom(this.parts.clock.currentTime);
    this.setState('playing');
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

  /**
   * The end first, then a stop from outside, then starvation: a clock that ran out while the
   * ticks were away leaves stale pairs behind, which must not hold it in `buffering`.
   */
  private followClock(now: Seconds): void {
    if (this.isPlayedOut(now)) {
      this.end();
      return;
    }
    if (this.isStoppedFromOutside()) {
      this.setState('paused');
      this.timeUpdates.announce(now);
      return;
    }
    if (this.run?.isStarvedAt(now, this.presented?.pair.timestamp) === true) {
      this.parts.clock.pause();
      this.setState('buffering');
      return;
    }
    this.timeUpdates.followPlayback(now);
  }

  /**
   * The platform started the clock by itself (a media key's play) while the session stood
   * still: the session follows, as it follows a stop.
   */
  private isStartedFromOutside(): boolean {
    return this.parts.clock.isRunning && this.machine.isOneOf('ready', 'paused', 'ended');
  }

  private async followStartFromOutside(): Promise<void> {
    try {
      await this.play();
    } catch {
      // The clock already runs: nothing is left to refuse.
    }
  }

  private isSeekCurrent(generation: number): boolean {
    return this.seeks.isCurrent(generation) && !this.machine.isOneOf('disposed', 'error');
  }

  /**
   * Stops the clock and puts it at `time`, remembering where it landed (a clock clamps to the
   * end of its own media).
   */
  private moveClockTo(time: Seconds): void {
    this.parts.clock.pause();
    this.parts.clock.seek(time);
    this.clockWatch.placedAt(this.parts.clock.currentTime);
  }

  /**
   * Follows the clock where the platform moved it, as a seek there: a stop that came with the
   * move is followed first and a start after it, as each would be followed alone.
   */
  private followMoveFromOutside(now: Seconds): void {
    const wasRunning = this.parts.clock.isRunning;
    if (!wasRunning && this.isIn('playing')) this.pause();
    this.seek(now);
    if (wasRunning && this.isIn('paused')) void this.followStartFromOutside();
  }

  /**
   * Ticks were missed while the clock ran on; an ended clock is left to end the session.
   */
  private haveTicksStopped(now: Seconds): boolean {
    const wereMissed = this.clockWatch.wereTicksMissed(now, this.isIn('playing'));
    return wereMissed && !this.parts.clock.hasEnded;
  }

  /**
   * Decodes anew from the clock's time, holding the clock until the frames there are ready:
   * the seek a page would take for the viewer's is not needed, the clock is where it must be.
   * A clock past the end ends there; one the platform stopped meanwhile lands `paused`.
   */
  private restartAt(now: Seconds): void {
    const { clock, duration } = this.parts;
    if (now >= duration) {
      this.moveClockTo(duration);
      this.end();
      return;
    }
    const wasRunning = clock.isRunning;
    clock.pause();
    this.startRun(now);
    this.setState(wasRunning ? 'buffering' : 'paused');
    if (!wasRunning) this.timeUpdates.announce(now);
  }

  /**
   * Ended, or paused at the end: a play from there starts over, as a media element does.
   */
  private isAtTheEnd(): boolean {
    const { clock, duration } = this.parts;
    const isAtEndOfMedia = clock.hasEnded || clock.currentTime >= duration;
    return this.machine.state === 'ended' || isAtEndOfMedia;
  }

  /**
   * The platform stopped the clock by itself (media keys, an audio interruption) while playing:
   * the session follows, so the next `play` starts it again.
   */
  private isStoppedFromOutside(): boolean {
    const { clock } = this.parts;
    return !clock.isRunning && !clock.hasEnded;
  }

  private isPrimed(): boolean {
    return this.run?.isPrimedAt(this.parts.clock.currentTime) === true;
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
    const attempt = this.takeStartAttempt();
    this.enterPlaying();
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
    this.takeStartAttempt()?.resolve();
  }

  private takeStartAttempt(): Deferred<void> | undefined {
    const attempt = this.startAttempt;
    this.startAttempt = undefined;
    return attempt;
  }

  /**
   * The clock's own media ran out (an audio track shorter than the video: the pairs after it are
   * unreachable, and the decoders may wait for room to decode them forever), or everything
   * decoded to the end has been shown and the clock passed the duration.
   */
  private isPlayedOut(now: Seconds): boolean {
    const hasShownAll = this.run?.isDrained === true && now >= this.parts.duration;
    return this.parts.clock.hasEnded || hasShownAll;
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
    this.clockWatch.forgetTicks();
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
    // A listener may have started over on `ended`: the end is past then.
    if (!this.isIn('ended')) return;
    this.timeUpdates.announce(this.parts.clock.currentTime);
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
