import type { DecodeRun } from './DecodeRun';
import type { SessionLifecycle } from './SessionLifecycle';
import { Deferred } from '../../shared/async/Deferred';
import type { Seconds } from '../../shared/units/time';

/**
 * What of the decode run under way tells whether its frames are ready.
 */
type RunUnderWay = Pick<DecodeRun<unknown>, 'isPrimedAt'>;

/**
 * A session's `buffering` (ADR 0011): entering it, the `play` waiting for the clock to start
 * meanwhile, and what ends it, told in one place.
 */
export class Buffering {
  private startAttempt: Deferred<void> | undefined;

  public constructor(private readonly lifecycle: SessionLifecycle) {}

  /**
   * The `play` waiting for buffering to end, if one is.
   */
  public get waitingStart(): Promise<void> | undefined {
    return this.startAttempt?.promise;
  }

  public enter(): void {
    this.lifecycle.moveTo('buffering');
  }

  /**
   * Buffers for the first frames of a start, which the promise waits for.
   */
  public enterForStart(): Promise<void> {
    const attempt = new Deferred<void>();
    this.startAttempt = attempt;
    this.enter();
    return attempt.promise;
  }

  /**
   * Buffering is over at `now`: the frames there are decoded.
   */
  public isOverAt(run: RunUnderWay | undefined, now: Seconds): boolean {
    return this.lifecycle.is('buffering') && run?.isPrimedAt(now) === true;
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
