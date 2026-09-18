import type { FramePair } from './FramePair';
import type { DecodedFrame } from '../../ports/VideoDecoderPort';
import { ensureIndexInRange } from '../../shared/errors/GyroViewError';
import { seconds, type Seconds } from '../../shared/units/time';

/**
 * Buffers decoded frames per lens and emits a {@link FramePair} as soon as every lens has a frame
 * for the same instant. Lens tracks of one recording share the camera clock, so their timestamps
 * agree exactly; the tolerance only absorbs floating-point conversion noise.
 */
export class FramePairer<Handle = unknown> {
  private readonly queues: DecodedFrame<Handle>[][];
  private unpairedCount = 0;

  public constructor(
    lensCount: number,
    private readonly tolerance: Seconds,
    private readonly onPair: (pair: FramePair<Handle>) => void,
  ) {
    this.queues = Array.from({ length: lensCount }, () => []);
  }

  /**
   * Frames dropped because no other lens ever produced a matching instant.
   */
  public get unpaired(): number {
    return this.unpairedCount;
  }

  public push(lensIndex: number, frame: DecodedFrame<Handle>): void {
    ensureIndexInRange(lensIndex, this.queues.length, 'lens');
    this.queues[lensIndex]?.push(frame);
    this.drain();
  }

  /**
   * Closes everything still buffered, for example when stopping mid-stream.
   */
  public discardAll(): void {
    for (const queue of this.queues) {
      for (const frame of queue) frame.close();
      queue.length = 0;
    }
  }

  private drain(): void {
    while (this.queues.every((queue) => queue.length > 0)) {
      const heads = this.queues.map((queue) => queue[0]).filter((frame) => frame !== undefined);
      const earliest = Math.min(...heads.map((frame) => frame.timestamp));
      const isAligned = heads.every(
        (frame) => Math.abs(frame.timestamp - earliest) <= this.tolerance,
      );
      if (isAligned) this.emit(heads, seconds(earliest));
      else this.dropHeadAt(earliest);
    }
  }

  private emit(frames: readonly DecodedFrame<Handle>[], timestamp: Seconds): void {
    for (const queue of this.queues) queue.shift();
    this.onPair({ timestamp, frames });
  }

  private dropHeadAt(timestamp: number): void {
    const queue = this.queues.find((candidate) => candidate[0]?.timestamp === timestamp);
    queue?.shift()?.close();
    this.unpairedCount += 1;
  }
}
