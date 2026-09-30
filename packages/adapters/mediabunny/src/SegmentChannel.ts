import { ensureInvariant, GyroViewError } from '@gyroview/core';

type Segment = Uint8Array<ArrayBuffer>;

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };

/**
 * Hands segments from the muxer's synchronous callbacks to one asynchronous consumer, with a
 * bound on how many may wait unconsumed so re-packaging never runs far ahead of playback.
 * Closing from either side ends the exchange; a producer failure reaches the consumer as a
 * thrown error once the segments before it are drained. A second concurrent consumer is a
 * programming error.
 */
export class SegmentChannel {
  private readonly queue: Uint8Array<ArrayBuffer>[] = [];
  private roomWaiters: (() => void)[] = [];
  private takeWaiter: (() => void) | undefined;
  private isClosedNow = false;
  private failure: Error | undefined;

  public constructor(private readonly capacity: number) {}

  public get isClosed(): boolean {
    return this.isClosedNow;
  }

  public push(segment: Uint8Array<ArrayBuffer>): void {
    if (this.isClosedNow) return;
    this.queue.push(segment);
    this.wakeTaker();
  }

  /**
   * Resolves once fewer than `capacity` segments wait, or at once when the channel is closed.
   */
  public waitForRoom(): Promise<void> {
    const hasRoom = this.queue.length < this.capacity || this.isClosedNow;
    return hasRoom
      ? Promise.resolve()
      : new Promise((resolve) => {
          this.roomWaiters.push(resolve);
        });
  }

  public close(): void {
    this.isClosedNow = true;
    this.wakeTaker();
    this.wakeRoomWaiters();
  }

  public fail(error: unknown): void {
    this.failure ??=
      error instanceof Error
        ? error
        : new GyroViewError('decode', 'audio re-packaging failed', { cause: error });
    this.close();
  }

  /**
   * The consumer's side: the segments in order until the channel is closed and drained, then
   * the producer's failure if it had one. Returning closes the channel at once, even while a
   * segment is awaited, which then comes as the end. `onEnd` hears once of the end, however it
   * came: the producer's resources may go.
   */
  public segments(onEnd: () => void = doNothing): SegmentReading {
    return new SegmentReading({
      take: (): Promise<Segment | undefined> => this.take(),
      close: (): void => {
        this.close();
      },
      onEnd,
    });
  }

  /**
   * The next segment; undefined once closed and drained; the producer's failure, if it had one.
   */
  private async take(): Promise<Uint8Array<ArrayBuffer> | undefined> {
    while (this.queue.length === 0 && !this.isClosedNow) await this.nextPush();
    const next = this.queue.shift();
    if (next) {
      this.wakeRoomWaiters();
      return next;
    }
    if (this.failure) throw this.failure;
    return undefined;
  }

  private nextPush(): Promise<void> {
    ensureInvariant(this.takeWaiter === undefined, 'a segment channel has one consumer');
    return new Promise((resolve) => {
      this.takeWaiter = resolve;
    });
  }

  private wakeTaker(): void {
    const waiter = this.takeWaiter;
    this.takeWaiter = undefined;
    waiter?.();
  }

  private wakeRoomWaiters(): void {
    if (this.queue.length >= this.capacity && !this.isClosedNow) return;
    const waiters = this.roomWaiters;
    this.roomWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

interface ReadingParts {
  readonly take: () => Promise<Segment | undefined>;
  readonly close: () => void;
  readonly onEnd: () => void;
}

/**
 * Iterates a channel's segments. A class, not a generator: a generator's return waits behind the
 * segment it awaits, and the producer would re-package another fragment for nobody.
 */
class SegmentReading implements AsyncIterableIterator<Segment> {
  private hasEnded = false;

  public constructor(private readonly parts: ReadingParts) {}

  public async next(): Promise<IteratorResult<Segment>> {
    if (this.hasEnded) return DONE;
    try {
      const segment = await this.parts.take();
      return segment === undefined || this.wasEnded()
        ? this.end()
        : { done: false, value: segment };
    } catch (error) {
      this.end();
      throw error;
    }
  }

  public return(): Promise<IteratorResult<Segment>> {
    this.parts.close();
    return Promise.resolve(this.end());
  }

  public [Symbol.asyncIterator](): this {
    return this;
  }

  /**
   * Asked afresh after the wait: the consumer may have returned meanwhile.
   */
  private wasEnded(): boolean {
    return this.hasEnded;
  }

  private end(): IteratorReturnResult<undefined> {
    if (!this.hasEnded) this.parts.onEnd();
    this.hasEnded = true;
    return DONE;
  }
}

function doNothing(): void {
  // A consumer with nothing to release.
}
