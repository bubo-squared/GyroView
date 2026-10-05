import type { FramePair } from '../../ports/FramePair';
import { ClockWatch, isAtEndOfMedia, isStoppedFromOutside } from './ClockWatch';
import { SeekOrder } from './SeekOrder';
import { TimeUpdates } from './TimeUpdates';
import { Buffering } from './Buffering';
import { ClockStart } from './ClockStart';
import { SessionLifecycle, type PlaybackSessionEvents } from './SessionLifecycle';
import { DecodeRun, type DecodeRunParts } from './DecodeRun';
import { keyframeTimeAt } from './keyframeTimeAt';
import { PictureOnScreen } from './PictureOnScreen';
import { isFlowing, type PlayerState } from '../../domain/playback/PlayerState';
import type { FrameSink } from '../../ports/FrameSink';
import type { PlaybackClock } from '../../ports/PlaybackClock';
import { asGyroViewError } from '../../shared/errors/GyroViewError';
import { TypedEmitter } from '../../shared/events/TypedEmitter';
import { seconds, type Seconds } from '../../shared/units/time';
import { clamp } from '../../shared/math/clamp';

export type { PlaybackSessionEvents } from './SessionLifecycle';

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
 *
 * Every change is made whole before its listeners hear of it (ADR 0021): what a method does
 * after announcing never depends on what a listener did meanwhile. The one exception is the
 * clock's start, which waits for `playing` to be heard, so that a listener pausing on it keeps
 * the sound from ever starting.
 */
export class PlaybackSession<Handle = unknown> {
  public readonly events = new TypedEmitter<PlaybackSessionEvents>();
  private readonly lifecycle = new SessionLifecycle(this.events);
  /**
   * The decode under way, if any: one per start or seek, replaced whole.
   */
  private run: DecodeRun<Handle> | undefined;
  private readonly screen: PictureOnScreen<Handle>;
  private readonly timeUpdates = new TimeUpdates(this.lifecycle);
  private readonly buffering = new Buffering(this.lifecycle);
  private readonly clockWatch = new ClockWatch();
  private readonly seeks = new SeekOrder();
  private readonly starts: ClockStart;
  private shouldLoop = false;

  public constructor(private readonly parts: PlaybackSessionParts<Handle>) {
    this.screen = new PictureOnScreen(parts.sink, (error) => {
      this.fail(error);
    });
    this.starts = new ClockStart({
      clock: parts.clock,
      lifecycle: this.lifecycle,
      clockWatch: this.clockWatch,
      buffering: this.buffering,
    });
  }

  public get state(): PlayerState {
    return this.lifecycle.current;
  }

  public get currentTime(): Seconds {
    return this.parts.clock.currentTime;
  }

  /**
   * A seek waits for its first picture: it is done once that is drawn, and a playing session
   * resumes only then (ADR 0042).
   */
  public get isSeeking(): boolean {
    return this.seeks.isUnderWay;
  }

  /**
   * Starts or resumes, resolving once the clock runs. A paused session keeps its pipeline and
   * the pairs it prefetched; a fresh one starts decoding anew, and an ended one or one paused at
   * the end starts over from the beginning, and waits in `buffering` for the first pairs.
   * Rejects, back in `paused`, when the clock refuses to start (autoplay policy); the host then
   * waits for a user gesture. Pausing meanwhile, a listener's pause included, resolves quietly.
   */
  public async play(): Promise<void> {
    if (this.lifecycle.current === 'playing') return;
    if (this.lifecycle.current === 'buffering') {
      await this.buffering.awaitStart();
      return;
    }
    await this.lifecycle.change(() => this.beginStart());
  }

  /**
   * Stops the clock, whatever the state says: a clock start still under way may have been asked
   * for before a pause. A running clock stops where it ran to, which no tick takes for a move
   * from outside.
   */
  public pause(): void {
    this.lifecycle.change(() => {
      const wasRunning = this.parts.clock.isRunning;
      this.parts.clock.pause();
      if (wasRunning) this.clockWatch.stoppedAt(this.parts.clock.currentTime);
      if (!this.lifecycle.canMoveTo('paused')) return;
      this.lifecycle.moveTo('paused');
      this.buffering.settleStart();
      this.timeUpdates.announce(this.parts.clock.currentTime);
    });
  }

  /**
   * Pause and return to the beginning, showing the first frame again on the next tick.
   */
  public stop(): void {
    this.lifecycle.change(() => {
      this.pause();
      this.seek(seconds(0));
    });
  }

  /**
   * Jumps to a time. A playing session resumes through `buffering` once the frame there has been
   * drawn and the next ones decoded; a paused one shows the target frame and stays paused. The
   * seek is `seeked` once its first picture is drawn.
   */
  public seek(time: Seconds): void {
    if (this.lifecycle.isOneOf('disposed', 'error')) return;
    this.lifecycle.change(() => {
      const target = seconds(clamp(time, 0, this.parts.duration));
      const wasFlowing = isFlowing(this.lifecycle.current);
      this.seeks.begin();
      this.moveClockTo(target);
      this.startRun(target);
      this.lifecycle.moveTo('seeking');
      if (wasFlowing) this.buffering.enter('priming');
      else this.lifecycle.moveTo('paused');
      this.timeUpdates.announce(target);
    });
  }

  /**
   * Seeks to the key frame at or before `time`: what a dragged seek bar can show at once,
   * without decoding a whole group of pictures first.
   */
  public async scrub(time: Seconds): Promise<void> {
    const [track] = this.parts.frameSources;
    if (!track || this.lifecycle.isOneOf('disposed', 'error')) return;
    const target = seconds(clamp(time, 0, this.parts.duration));
    const ticket = this.seeks.claimScrub();
    const keyframeTime = await keyframeTimeAt(track, target);
    // A seek or scrub made meanwhile is newer: this scrub lands no more.
    if (!this.seeks.isScrubCurrent(ticket) || this.lifecycle.isOneOf('disposed', 'error')) return;
    this.seek(keyframeTime);
  }

  /**
   * Whether the end seeks back to the start and plays on, as a media element's `loop` does,
   * rather than ending.
   */
  public setLooping(shouldLoop: boolean): void {
    this.shouldLoop = shouldLoop;
  }

  /**
   * Starts decoding at the current time without playing, so the frame there shows while the
   * session is still `ready`.
   */
  public preload(): void {
    if (this.run || this.lifecycle.current !== 'ready') return;
    this.lifecycle.change(() => {
      this.startRun(this.parts.clock.currentTime);
    });
  }

  /**
   * Presents the frame pair due at the clock's time, if a newer one has arrived, and follows
   * the clock: to the end, into `buffering`, into failure, and into a start or a stop the
   * platform made by itself (media keys, an audio interruption).
   */
  public tick(): void {
    if (this.lifecycle.isOneOf('disposed', 'error')) return;
    this.lifecycle.change(() => {
      const { failure } = this.parts.clock;
      if (failure) {
        this.fail(failure);
        return;
      }
      const now = this.parts.clock.currentTime;
      if (this.clockWatch.wasMovedFromOutside({ now, state: this.lifecycle.current })) {
        this.followMoveFromOutside(now);
        return;
      }
      if (this.haveTicksStopped(now)) {
        this.restartAt(now);
        return;
      }
      this.presentDue(now);
      if (this.lifecycle.is('playing')) this.followClock(now);
      else if (this.isStartedFromOutside()) void this.followStartFromOutside();
    });
  }

  /**
   * Hands the pair on screen to the sink again, so a change in how it is drawn shows while the
   * picture stands still; while playing, the next pair shows it soon enough.
   */
  public redraw(): void {
    if (!this.screen.hasPicture || this.lifecycle.isOneOf('playing', 'error')) return;
    this.lifecycle.change(() => {
      this.screen.redraw();
    });
  }

  public dispose(): void {
    if (this.lifecycle.current === 'disposed') return;
    this.lifecycle.change(() => {
      this.abortRun();
      this.screen.clear();
      this.parts.clock.pause();
      this.seeks.finish();
      this.lifecycle.moveTo('disposed');
      this.buffering.settleStart();
    });
    this.events.removeAll();
  }

  /**
   * A start from where the session stands, from the beginning when it stands at the end: what
   * to await once it has been announced, or nothing when there is nothing to start.
   */
  private beginStart(): Promise<void> | undefined {
    if (this.isAtTheEnd()) this.seek(seconds(0));
    if (!this.lifecycle.canMoveTo('buffering')) return undefined;
    if (!this.run) this.startRun(this.parts.clock.currentTime);
    return this.isPrimed() ? this.starts.begin() : this.startOncePrimed();
  }

  /**
   * `buffering` until the frames are ready, the clock held meanwhile, even one the platform
   * started (a media key's play). A pause settles the wait.
   */
  private startOncePrimed(): Promise<void> {
    this.parts.clock.pause();
    return this.buffering.enterForStart();
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
    // The platform stopped the clock while playing: the next `play` starts it again.
    if (isStoppedFromOutside(this.parts.clock)) {
      this.lifecycle.moveTo('paused');
      this.timeUpdates.announce(now);
      return;
    }
    if (this.run?.isStarvedAt(now, this.screen.timestamp) === true) {
      this.parts.clock.pause();
      this.buffering.enter('starvation');
      return;
    }
    this.timeUpdates.followPlayback(now);
  }

  /**
   * The platform started the clock by itself (a media key's play) while the session stood
   * still: the session follows, as it follows a stop.
   */
  private isStartedFromOutside(): boolean {
    return this.parts.clock.isRunning && this.lifecycle.isOneOf('ready', 'paused', 'ended');
  }

  private async followStartFromOutside(): Promise<void> {
    try {
      await this.play();
    } catch {
      // The clock already runs: nothing is left to refuse.
    }
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
    if (!wasRunning && this.lifecycle.is('playing')) this.pause();
    this.seek(now);
    if (wasRunning && this.lifecycle.is('paused')) void this.followStartFromOutside();
  }

  /**
   * Ticks were missed while the clock ran on; an ended clock is left to end the session.
   */
  private haveTicksStopped(now: Seconds): boolean {
    const wereMissed = this.clockWatch.wereTicksMissed({ now, state: this.lifecycle.current });
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
    if (wasRunning) {
      this.buffering.enter('priming');
      return;
    }
    this.lifecycle.moveTo('paused');
    this.timeUpdates.announce(now);
  }

  /**
   * Ended, or paused at the end: a play from there starts over, as a media element does.
   */
  private isAtTheEnd(): boolean {
    return (
      this.lifecycle.current === 'ended' || isAtEndOfMedia(this.parts.clock, this.parts.duration)
    );
  }

  /**
   * Ready to move: the frames are decoded, and a seek's picture is on screen.
   */
  private isPrimed(): boolean {
    const isDecoded = this.run?.isPrimedAt(this.parts.clock.currentTime) === true;
    return isDecoded && !this.seeks.isUnderWay;
  }

  /**
   * Called as pairs arrive and when a run ends: the moment a seek can show its picture and
   * `buffering` has what it waits for.
   */
  private resumeIfPrimed(): void {
    this.lifecycle.change(() => {
      if (this.seeks.isUnderWay) this.showSeekPicture();
      if (this.seeks.isUnderWay) return;
      if (this.buffering.isOverAt(this.run, this.parts.clock.currentTime)) {
        void this.starts.resume();
      }
    });
  }

  /**
   * Draws a seek's first picture as soon as it is decoded, not at the next tick, which a hidden
   * tab or an offscreen frame never gets: the sound resumes there too. A seek whose decode ended
   * without a picture is done all the same, or playback would wait for ever.
   */
  private showSeekPicture(): void {
    this.presentDue(this.parts.clock.currentTime);
    if (this.seeks.isUnderWay && this.run?.isDrained === true) this.finishSeek();
  }

  private finishSeek(): void {
    this.seeks.finish();
    this.lifecycle.announce('seeked', this.parts.clock.currentTime);
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
    if (!this.screen.show(pair, mediaTime)) return;
    this.lifecycle.announce('present', mediaTime);
    if (this.seeks.isUnderWay) this.finishSeek();
  }

  /**
   * Replaces the run under way; the one replaced reports to nobody, so only the current run may
   * wake a waiting start, end or fail the session.
   */
  private startRun(from: Seconds): void {
    this.abortRun();
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

  /**
   * The time first, then the state, then the end, as a media element fires `timeupdate`, `pause`
   * and `ended`. A looping session seeks back to the start instead and plays on.
   */
  private end(): void {
    if (!this.lifecycle.canMoveTo('ended')) return;
    if (this.shouldLoop) {
      this.seek(seconds(0));
      return;
    }
    this.parts.clock.pause();
    this.timeUpdates.announce(this.parts.clock.currentTime);
    this.lifecycle.moveTo('ended');
    this.lifecycle.announce('ended', undefined);
  }

  private fail(error: unknown): void {
    if (!this.lifecycle.canMoveTo('error')) return;
    this.lifecycle.change(() => {
      this.parts.clock.pause();
      this.abortRun();
      this.seeks.finish();
      this.lifecycle.moveTo('error');
      this.buffering.settleStart();
      this.lifecycle.announce('error', asGyroViewError(error, 'decode', 'playback failed'));
    });
  }
}
