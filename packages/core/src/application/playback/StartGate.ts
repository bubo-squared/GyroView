import { closeFramePair, type FramePair } from '../../ports/FramePair';
import type { Seconds } from '../../shared/units/time';

/**
 * Sits between the pairer and the output of one decode run. Pairs at or after the start pass
 * straight through. Pairs before the start exist only because decoding had to begin at a key
 * frame; of those the gate keeps the newest and releases it ahead of the first pair after the
 * start, because that is the frame on screen at the start. Older ones are closed.
 *
 * A pair within `tolerance` of the start counts as at the start: a decoder carries timestamps in
 * whole microseconds, so the frame of a sample timed between two of them comes back a fraction
 * of one early, and a seek to that sample must still show it at once. That pair is the one on
 * screen at the start, so the pair held before it is closed rather than released.
 */
export class StartGate<Handle> {
  private held: FramePair<Handle> | undefined;
  private droppedCount = 0;

  public constructor(
    private readonly from: Seconds,
    private readonly tolerance: Seconds,
    private readonly deliver: (pair: FramePair<Handle>) => void,
  ) {}

  /**
   * How many pairs before the start were superseded by a newer one and closed.
   */
  public get dropped(): number {
    return this.droppedCount;
  }

  public push(pair: FramePair<Handle>): void {
    if (pair.timestamp < this.from - this.tolerance) {
      this.hold(pair);
      return;
    }
    if (pair.timestamp <= this.from + this.tolerance) this.dropHeld();
    else this.release();
    this.deliver(pair);
  }

  /**
   * Delivers the held pair, if any. A run that ends before reaching the start (a start at or
   * past the last frame) calls this so that last frame is still shown.
   */
  public release(): void {
    if (!this.held) return;
    const pair = this.held;
    this.held = undefined;
    this.deliver(pair);
  }

  public discard(): void {
    if (this.held) closeFramePair(this.held);
    this.held = undefined;
  }

  private hold(pair: FramePair<Handle>): void {
    this.dropHeld();
    this.held = pair;
  }

  /**
   * Closes the held pair, superseded by a newer one before or at the start.
   */
  private dropHeld(): void {
    if (!this.held) return;
    closeFramePair(this.held);
    this.held = undefined;
    this.droppedCount += 1;
  }
}
