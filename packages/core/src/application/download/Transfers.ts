import type { Block, BlockStore } from './BlockStore';
import type { TransferState } from '../../domain/download/planDownloads';
import type { ByteStream } from '../../ports/ByteStream';
import { ByteRange } from '../../shared/binary/ByteRange';

/**
 * What the transfers tell the download that runs them.
 */
export interface TransferListener {
  /**
   * Bytes came: a reader waiting for them may go on.
   */
  onChunk(): void;
  /**
   * A range came whole: there is room for another.
   */
  onEnd(): void;
  /**
   * The part of a range that had not come failed, after the stream's own retries; what came is
   * kept.
   */
  onFailure(range: ByteRange, error: unknown): void;
}

export interface TransfersParts {
  readonly stream: ByteStream;
  readonly store: BlockStore;
  readonly listener: TransferListener;
}

interface Transfer {
  readonly id: number;
  readonly block: Block;
  readonly chunks: AsyncIterator<Uint8Array>;
  delivered: number;
}

/**
 * The ranges a download has asked for and is receiving, each streamed into its block. A range
 * given up is returned to the stream at once, so nothing more of it comes.
 */
export class Transfers {
  private nextId = 1;
  private readonly running = new Map<number, Transfer>();

  public constructor(private readonly parts: TransfersParts) {}

  public get states(): TransferState[] {
    return [...this.running.values()].map((transfer) => ({
      id: transfer.id,
      remaining: remainingOf(transfer),
    }));
  }

  /**
   * Whether every byte of `range` has come or is coming in one range still streaming.
   */
  public isBringing(range: ByteRange): boolean {
    for (const transfer of this.running.values()) {
      if (transfer.block.range.contains(range)) return true;
    }
    return false;
  }

  public start(range: ByteRange): void {
    const transfer: Transfer = {
      id: this.nextId,
      block: this.parts.store.allocate(range),
      chunks: this.parts.stream.stream(range)[Symbol.asyncIterator](),
      delivered: 0,
    };
    this.nextId += 1;
    this.running.set(transfer.id, transfer);
    void this.pump(transfer);
  }

  public cancel(id: number): void {
    const transfer = this.running.get(id);
    if (!transfer) return;
    this.running.delete(id);
    void transfer.chunks.return?.();
    this.parts.store.trim(transfer.block);
  }

  public cancelAll(): void {
    for (const id of this.running.keys()) this.cancel(id);
  }

  private async pump(transfer: Transfer): Promise<void> {
    try {
      for (
        let next = await transfer.chunks.next();
        next.done !== true;
        next = await transfer.chunks.next()
      ) {
        if (!this.isRunning(transfer)) return;
        this.parts.store.write(transfer.block, next.value);
        transfer.delivered += next.value.byteLength;
        this.parts.listener.onChunk();
      }
      this.finish(transfer);
    } catch (error) {
      this.fail(transfer, error);
    }
  }

  private finish(transfer: Transfer): void {
    if (!this.isRunning(transfer)) return;
    this.running.delete(transfer.id);
    this.parts.store.complete(transfer.block);
    this.parts.listener.onEnd();
  }

  private fail(transfer: Transfer, error: unknown): void {
    if (!this.isRunning(transfer)) return;
    this.running.delete(transfer.id);
    this.parts.store.trim(transfer.block);
    this.parts.listener.onFailure(remainingOf(transfer), error);
  }

  private isRunning(transfer: Transfer): boolean {
    return this.running.get(transfer.id) === transfer;
  }
}

function remainingOf(transfer: Transfer): ByteRange {
  const { range } = transfer.block;
  return ByteRange.of(range.offset + transfer.delivered, range.length - transfer.delivered);
}
