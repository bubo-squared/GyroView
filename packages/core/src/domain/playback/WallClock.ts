import type { PlaybackClock } from '../../ports/PlaybackClock';
import {
  milliseconds,
  millisecondsToSeconds,
  seconds,
  type Seconds,
} from '../../shared/units/time';

/**
 * PlaybackClock that advances with real time and never ends or fails by itself. Used for
 * recordings without an audio track and in tests, where `now` (milliseconds) is injected.
 */
export class WallClock implements PlaybackClock {
  public readonly hasEnded = false;
  public readonly failure = undefined;
  private isRunningNow = false;
  private positionAtAnchor: Seconds = seconds(0);
  private anchorMs = 0;

  public constructor(private readonly now: () => number = () => Date.now()) {}

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
