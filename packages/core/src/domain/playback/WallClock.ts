import type { PlaybackClock } from '../../ports/PlaybackClock';
import { seconds, type Seconds } from '../../shared/units/time';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * PlaybackClock that advances with real time at the chosen rate and never ends or fails by
 * itself. Used for recordings without an audio track and in tests, where `now` is injected.
 */
export class WallClock implements PlaybackClock {
  public readonly hasEnded = false;
  public readonly failure = undefined;
  private isRunningNow = false;
  private rateValue = 1;
  private positionAtAnchor: Seconds = seconds(0);
  private anchorMs = 0;

  public constructor(private readonly now: () => number = () => Date.now()) {}

  public get currentTime(): Seconds {
    if (!this.isRunningNow) return this.positionAtAnchor;
    const elapsed = (this.now() - this.anchorMs) / MILLISECONDS_PER_SECOND;
    return seconds(this.positionAtAnchor + elapsed * this.rateValue);
  }

  public get isRunning(): boolean {
    return this.isRunningNow;
  }

  public get rate(): number {
    return this.rateValue;
  }

  public start(): Promise<void> {
    if (!this.isRunningNow) {
      this.anchorMs = this.now();
      this.isRunningNow = true;
    }
    return Promise.resolve();
  }

  public pause(): void {
    if (!this.isRunningNow) return;
    this.positionAtAnchor = this.currentTime;
    this.isRunningNow = false;
  }

  public seek(time: Seconds): void {
    this.positionAtAnchor = time;
    this.anchorMs = this.now();
  }

  public setRate(rate: number): void {
    this.positionAtAnchor = this.currentTime;
    this.anchorMs = this.now();
    this.rateValue = rate;
  }

  public dispose(): void {
    this.pause();
  }
}
