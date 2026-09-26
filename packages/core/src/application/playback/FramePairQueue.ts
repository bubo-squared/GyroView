import { closeFramePair, type FramePair } from '../../ports/FramePair';
import { ensureInvariant } from '../../shared/errors/GyroViewError';
import type { Seconds } from '../../shared/units/time';

/**
 * Buffer of decoded pairs between the decode pipeline (producer) and the renderer (consumer).
 * `capacity` is a soft limit: the producer waits for room before feeding more packets, but frames
 * already in flight always land, so the queue may briefly hold `capacity` plus the decoders'
 * pending limit. Pairs leave the queue when the consumer takes them; the consumer then owns them
 * and closes them when they are superseded.
 */
export class FramePairQueue<Handle = unknown> {
  private readonly pairs: FramePair<Handle>[] = [];
  private roomWaiters: (() => void)[] = [];
  private isClosed = false;

  /**
   * `onPush` hears about every pair kept, so a consumer waiting for frames need not poll.
   */
  public constructor(
    private readonly capacity: number,
    private readonly onPush: () => void = doNothing,
  ) {
    ensureInvariant(
      Number.isSafeInteger(capacity) && capacity > 0,
      'queue capacity must be positive',
    );
  }

  public get length(): number {
    return this.pairs.length;
  }

  public get isFull(): boolean {
    return this.pairs.length >= this.capacity;
  }

  public get isClosedForGood(): boolean {
    return this.isClosed;
  }

  /**
   * Resolves once the queue is below capacity, or immediately once it was closed.
   */
  public waitForRoom(): Promise<void> {
    const hasRoom = !this.isFull || this.isClosed;
    return hasRoom
      ? Promise.resolve()
      : new Promise((resolve) => {
          this.roomWaiters.push(resolve);
        });
  }

  /**
   * Adds a pair; a closed queue closes the pair instead of keeping it.
   */
  public push(pair: FramePair<Handle>): void {
    if (this.isClosed) {
      closeFramePair(pair);
      return;
    }
    this.pairs.push(pair);
    this.onPush();
  }

  /**
   * Removes and returns the latest pair at or before `time`, closing older pairs it skips over.
   * Undefined when no queued pair is due yet; newer pairs stay queued.
   */
  public takePairAt(time: Seconds): FramePair<Handle> | undefined {
    let taken: FramePair<Handle> | undefined;
    while (this.pairs.length > 0 && (this.pairs[0]?.timestamp ?? Infinity) <= time) {
      if (taken) closeFramePair(taken);
      taken = this.pairs.shift();
    }
    if (taken) this.wakeWaiters();
    return taken;
  }

  public peekTimestamp(): Seconds | undefined {
    return this.pairs[0]?.timestamp;
  }

  /**
   * Drops and closes everything held, and every pair pushed from now on.
   */
  public close(): void {
    this.isClosed = true;
    for (const pair of this.pairs) closeFramePair(pair);
    this.pairs.length = 0;
    this.wakeWaiters();
  }

  private wakeWaiters(): void {
    if (this.isFull && !this.isClosed) return;
    const waiters = this.roomWaiters;
    this.roomWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

function doNothing(): void {
  // The default observer.
}
