const WINDOW_MS = 1000;

/**
 * Frames presented in the last second, from the times they were presented at.
 */
export class FpsCounter {
  private readonly presentedAt: number[] = [];

  public record(nowMs: number): void {
    this.presentedAt.push(nowMs);
    this.forget(nowMs);
  }

  public rateAt(nowMs: number): number {
    this.forget(nowMs);
    return this.presentedAt.length;
  }

  private forget(nowMs: number): void {
    const cutoff = nowMs - WINDOW_MS;
    while (this.presentedAt.length > 0 && (this.presentedAt[0] ?? 0) <= cutoff) {
      this.presentedAt.shift();
    }
  }
}
