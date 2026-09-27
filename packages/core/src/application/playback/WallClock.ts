import type { PlaybackClock } from '../../ports/PlaybackClock';
import {
  milliseconds,
  type Milliseconds,
  millisecondsToSeconds,
  seconds,
  type Seconds,
} from '../../shared/units/time';

/**
 * PlaybackClock that advances with `now` (milliseconds of real time, from a monotonic source)
 * and never ends or fails by itself: for recordings without a playable audio track, and tests.
 */
export class WallClock implements PlaybackClock {
  public readonly hasEnded = false;
  public readonly failure = undefined;
  private isRunningNow = false;
  private positionAtAnchor: Seconds = seconds(0);
  private anchorMs = 0;

  public constructor(private readonly now: () => Milliseconds) {}

  public get isRunning(): boolean {
    return this.isRunningNow;
  }

  public get currentTime(): Seconds {
    if (!this.isRunningNow) return this.positionAtAnchor;
    const elapsed = millisecondsToSeconds(milliseconds(this.now() - this.anchorMs));
    return seconds(this.positionAtAnchor + elapsed);
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

  public dispose(): void {
    this.pause();
  }
}
