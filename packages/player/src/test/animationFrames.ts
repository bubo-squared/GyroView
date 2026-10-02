import type { FrameScheduler } from '../composition/animationFrames';

/**
 * Animation frames that come when the test fires them.
 */
export class ManualScheduler implements FrameScheduler {
  private readonly pending = new Map<number, () => void>();
  private next = 1;

  public get pendingCount(): number {
    return this.pending.size;
  }

  public request(callback: () => void): number {
    const handle = this.next;
    this.next += 1;
    this.pending.set(handle, callback);
    return handle;
  }

  public cancel(handle: number): void {
    this.pending.delete(handle);
  }

  /**
   * Runs what is due now; frames requested while firing wait for the next call.
   */
  public fire(): void {
    const due = [...this.pending.values()];
    this.pending.clear();
    for (const callback of due) callback();
  }
}
