import type { FrameSink, Presentation } from '../ports/FrameSink';

/**
 * Test double for the renderer: records every presentation in order.
 */
export class FakeFrameSink<Handle = unknown> implements FrameSink<Handle> {
  public readonly presentations: Presentation<Handle>[] = [];

  public get lastTimestamp(): number | undefined {
    return this.presentations.at(-1)?.pair.timestamp;
  }

  public present(presentation: Presentation<Handle>): void {
    this.presentations.push(presentation);
  }
}
