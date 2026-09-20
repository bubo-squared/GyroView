/**
 * Schedules work for the next animation frame; `requestAnimationFrame` in the browser.
 */
export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const ANIMATION_FRAMES: FrameScheduler = {
  request: (callback): number => requestAnimationFrame(callback),
  cancel: (handle): void => {
    cancelAnimationFrame(handle);
  },
};

/**
 * Calls `tick` once per animation frame between {@link start} and {@link stop}.
 */
export class FrameLoop {
  private isActive = false;
  private handle: number | undefined;

  public constructor(
    private readonly tick: () => void,
    private readonly scheduler: FrameScheduler = ANIMATION_FRAMES,
  ) {}

  public get isRunning(): boolean {
    return this.isActive;
  }

  public start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.schedule();
  }

  public stop(): void {
    this.isActive = false;
    if (this.handle === undefined) return;
    this.scheduler.cancel(this.handle);
    this.handle = undefined;
  }

  private schedule(): void {
    this.handle = this.scheduler.request(() => {
      this.handle = undefined;
      this.tick();
      if (this.isActive) this.schedule();
    });
  }
}
