import type { PlaybackClock } from '../ports/PlaybackClock';
import type { GyroViewError } from '../shared/errors/GyroViewError';
import { seconds, type Seconds } from '../shared/units/time';

export interface FakePlaybackClockOptions {
  /**
   * Where the clock's own media runs out; it stops there and reports `hasEnded`.
   */
  readonly endsAt?: Seconds;
  /**
   * Makes every `start` reject with this error, like an autoplay policy would.
   */
  readonly refusesToStartWith?: GyroViewError;
}

/**
 * Test double for the clock port under full control of the test: time moves only through
 * {@link advance}, and the clock can end early or fail on demand.
 */
export class FakePlaybackClock implements PlaybackClock {
  public failure: GyroViewError | undefined;
  private position: Seconds = seconds(0);
  private isStarted = false;

  public constructor(private readonly options: FakePlaybackClockOptions = {}) {}

  public get currentTime(): Seconds {
    return this.position;
  }

  /**
   * For the test to see: started, not paused, not ended.
   */
  public get isRunning(): boolean {
    return this.isStarted && !this.hasEnded;
  }

  public get hasEnded(): boolean {
    return this.options.endsAt !== undefined && this.position >= this.options.endsAt;
  }

  public start(): Promise<void> {
    if (this.options.refusesToStartWith) return Promise.reject(this.options.refusesToStartWith);
    this.isStarted = true;
    return Promise.resolve();
  }

  public pause(): void {
    this.isStarted = false;
  }

  public seek(time: Seconds): void {
    this.position = time;
  }

  public dispose(): void {
    this.isStarted = false;
  }

  /**
   * Lets `elapsed` seconds of real time pass; the clock moves with it while running and never
   * past its end.
   */
  public advance(elapsed: Seconds): void {
    if (!this.isRunning) return;
    const next = this.position + elapsed;
    const { endsAt } = this.options;
    this.position = seconds(endsAt === undefined ? next : Math.min(next, endsAt));
  }
}
