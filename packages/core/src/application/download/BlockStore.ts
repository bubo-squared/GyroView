import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { ensureInvariant } from '../../shared/errors/GyroViewError';

/**
 * One range asked for: its bytes, allocated whole when asked for, filled from the start as they
 * come.
 */
export interface Block {
  readonly range: ByteRange;
}

class FillingBlock implements Block {
  public filled = 0;

  public constructor(
    public readonly range: ByteRange,
    public bytes: Uint8Array,
  ) {}

  public get filledRange(): ByteRange {
    return ByteRange.of(this.range.offset, this.filled);
  }
}

/**
 * The bytes a download holds, a block for each range it asked for. A range within one block is
 * handed out as a view of it; one across blocks is copied out of them. What counts against the
 * budget is what the blocks take, whether their bytes have come or not.
 */
export class BlockStore {
  private blocks: FillingBlock[] = [];

  public get held(): ByteRangeSet {
    return ByteRangeSet.of(this.blocks.map((block) => block.filledRange));
  }

  public get allocatedBytes(): number {
    return this.blocks.reduce((total, block) => total + block.bytes.byteLength, 0);
  }

  public allocate(range: ByteRange): Block {
    const block = new FillingBlock(range, new Uint8Array(range.length));
    this.blocks.push(block);
    return block;
  }

  public write(block: Block, chunk: Uint8Array): void {
    const filling = this.fillingOf(block);
    filling.bytes.set(chunk, filling.filled);
    filling.filled += chunk.byteLength;
  }

  /**
   * Keeps of a block only what has come, as when its range is given up; a block that got
   * nothing goes.
   */
  public trim(block: Block): void {
    const filling = this.fillingOf(block);
    filling.bytes = filling.bytes.slice(0, filling.filled);
    this.blocks = this.blocks.filter((held) => held.bytes.byteLength > 0);
  }

  /**
   * The bytes of `range`, if every one of them has come.
   */
  public bytesOf(range: ByteRange): Uint8Array | undefined {
    const within = this.blocks.find((block) => isWithin(block.filledRange, range));
    if (within) return viewOf(within, range);
    return this.held.covers(range) ? this.copyOf(range) : undefined;
  }

  /**
   * Lets go of the blocks whose every byte `released` holds.
   */
  public release(released: ByteRangeSet): void {
    this.blocks = this.blocks.filter((block) => !released.covers(block.filledRange));
  }

  private fillingOf(block: Block): FillingBlock {
    const filling = this.blocks.find((held) => held === block);
    ensureInvariant(filling !== undefined, 'the block is not one this store holds');
    return filling;
  }

  private copyOf(range: ByteRange): Uint8Array {
    const copy = new Uint8Array(range.length);
    for (const block of this.blocks) {
      const start = Math.max(block.range.offset, range.offset);
      const end = Math.min(block.filledRange.end, range.end);
      if (start < end)
        copy.set(
          block.bytes.subarray(start - block.range.offset, end - block.range.offset),
          start - range.offset,
        );
    }
    return copy;
  }
}

function isWithin(outer: ByteRange, inner: ByteRange): boolean {
  return outer.offset <= inner.offset && inner.end <= outer.end;
}

function viewOf(block: FillingBlock, range: ByteRange): Uint8Array {
  const start = range.offset - block.range.offset;
  return block.bytes.subarray(start, start + range.length);
}
