import { GyroViewError } from '@gyroview/core';

/**
 * Hands segments from the muxer's synchronous callbacks to an asynchronous consumer, with a
 * bound on how many may wait unconsumed so re-packaging never runs far ahead of playback.
 * Closing from either side ends the exchange; a producer failure reaches the consumer as a
 * thrown error once the segments before it are drained.
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

  public async *segments(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    let next = await this.take();
    while (next) {
      yield next;
      next = await this.take();
    }
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
