import type { DecodeRun } from './DecodeRun';
import type { SessionLifecycle } from './SessionLifecycle';
import { Deferred } from '../../shared/async/Deferred';
import type { Seconds } from '../../shared/units/time';

/**
 * What of the decode run under way tells whether buffering may end.
 */
type RunUnderWay = Pick<DecodeRun<unknown>, 'isPrimedAt' | 'isReadyToResumeAt'>;

/**
 * Why a session buffers (ADR 0011): `priming` after a start or a seek, until the frames there
 * are decoded; `starvation` when the decoders fell behind while playing, until they have caught
 * up and the next seconds are downloaded, so a link slower than the recording plays in
 * stretches rather than frame by frame.
 */
export type BufferingCause = 'priming' | 'starvation';

/**
 * A session's `buffering`: entering it and why, the `play` waiting for the clock to start
 * meanwhile, and what ends it, told in one place.
 */
export class Buffering {
  private cause: BufferingCause = 'priming';
  private startAttempt: Deferred<void> | undefined;

  public constructor(private readonly lifecycle: SessionLifecycle) {}

  public enter(cause: BufferingCause): void {
    this.cause = cause;
    this.lifecycle.moveTo('buffering');
  }

  /**
   * Buffers for the first frames of a start, which the promise waits for.
   */
  public enterForStart(): Promise<void> {
    const started = this.awaitStart();
    this.enter('priming');
    return started;
  }

  /**
   * Settles once buffering ends in a running clock: with the `play` already waiting, or as the
   * first one, for buffering a seek or a starvation entered without one.
   */
  public awaitStart(): Promise<void> {
    this.startAttempt ??= new Deferred<void>();
    return this.startAttempt.promise;
  }

  /**
   * Buffering is over at `now`: what its cause waits for is there.
   */
  public isOverAt(run: RunUnderWay | undefined, now: Seconds): boolean {
    if (!run || !this.lifecycle.is('buffering')) return false;
    return this.cause === 'priming' ? run.isPrimedAt(now) : run.isReadyToResumeAt(now);
  }

  /**
   * The waiting `play`, taken out to be settled by whoever ends the wait.
   */
  public takeStart(): Deferred<void> | undefined {
    const attempt = this.startAttempt;
    this.startAttempt = undefined;
    return attempt;
  }

  public settleStart(): void {
    this.takeStart()?.resolve();
  }
}
