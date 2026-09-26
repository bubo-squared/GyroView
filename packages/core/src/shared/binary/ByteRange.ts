import { GyroViewError } from '../errors/GyroViewError';

/**
 * A contiguous span of bytes in a source: `offset` is inclusive, `end` is exclusive.
 */
export class ByteRange {
  private constructor(
    public readonly offset: number,
    public readonly length: number,
  ) {}

  public static of(offset: number, length: number): ByteRange {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new GyroViewError(
        'invalid-byte-range',
        `offset must be a non-negative integer, got ${offset}`,
      );
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new GyroViewError(
        'invalid-byte-range',
        `length must be a non-negative integer, got ${length}`,
      );
    }
    return new ByteRange(offset, length);
  }

  /**
   * The last `length` bytes of a source of `totalSize` bytes.
   */
  public static lastOf(totalSize: number, length: number): ByteRange {
    if (length > totalSize) {
      throw new GyroViewError(
        'invalid-byte-range',
        `cannot take ${length} bytes from a ${totalSize}-byte source`,
      );
    }
    return this.of(totalSize - length, length);
  }

  public get end(): number {
    return this.offset + this.length;
  }

  public fitsWithin(totalSize: number): boolean {
    return this.end <= totalSize;
  }

  /**
   * Refuses a range that runs past the end of a `totalSize`-byte source with the error the
   * `RandomAccessSource` contract asks for; `source` names the source in the message.
   */
  public ensureWithin(totalSize: number, source: string): void {
    if (this.fitsWithin(totalSize)) return;
    throw new GyroViewError(
      'invalid-byte-range',
      `range ${this.offset}+${this.length} exceeds the ${totalSize}-byte ${source}`,
    );
  }
}
