import type { RandomAccessSource } from '../ports/RandomAccessSource';
import type { ByteRange } from '../shared/binary/ByteRange';
import { GyroViewError } from '../shared/errors/GyroViewError';

/**
 * Test double: a {@link RandomAccessSource} over bytes already in memory.
 */
export class InMemoryRandomAccessSource implements RandomAccessSource {
  public readonly reads: ByteRange[] = [];

  public constructor(private readonly bytes: Uint8Array) {}

  public size(): Promise<number> {
    return Promise.resolve(this.bytes.byteLength);
  }

  public read(range: ByteRange): Promise<Uint8Array> {
    this.reads.push(range);
    return range.fitsWithin(this.bytes.byteLength)
      ? Promise.resolve(this.bytes.slice(range.offset, range.end))
      : Promise.reject(this.outOfRange(range));
  }

  private outOfRange(range: ByteRange): GyroViewError {
    return new GyroViewError(
      'invalid-byte-range',
      `range ${range.offset}+${range.length} exceeds ${this.bytes.byteLength} bytes`,
    );
  }
}
