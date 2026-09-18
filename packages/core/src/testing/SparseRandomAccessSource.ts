import type { RandomAccessSource } from '../ports/RandomAccessSource';
import { ByteRange } from '../shared/binary/ByteRange';
import { GyroViewError } from '../shared/errors/GyroViewError';

interface Segment {
  readonly range: ByteRange;
  readonly bytes: Uint8Array;
}

/**
 * Test double for very large files: reports an arbitrary size and serves bytes only where a
 * segment was placed, zeros elsewhere. Lets trailer tests use real multi-gigabyte offsets
 * with kilobytes of fixture data.
 */
export class SparseRandomAccessSource implements RandomAccessSource {
  public readonly reads: ByteRange[] = [];
  private readonly segments: Segment[] = [];

  public constructor(private readonly totalSize: number) {}

  public place(offset: number, bytes: Uint8Array): this {
    const range = ByteRange.of(offset, bytes.byteLength);
    if (!range.fitsWithin(this.totalSize)) {
      throw new GyroViewError(
        'invalid-byte-range',
        `segment ${offset}+${bytes.byteLength} exceeds size ${this.totalSize}`,
      );
    }
    this.segments.push({ range, bytes });
    return this;
  }

  public size(): Promise<number> {
    return Promise.resolve(this.totalSize);
  }

  public read(range: ByteRange): Promise<Uint8Array> {
    this.reads.push(range);
    return range.fitsWithin(this.totalSize)
      ? Promise.resolve(this.assemble(range))
      : Promise.reject(this.outOfRange(range));
  }

  private outOfRange(range: ByteRange): GyroViewError {
    return new GyroViewError(
      'invalid-byte-range',
      `range ${range.offset}+${range.length} exceeds size ${this.totalSize}`,
    );
  }

  private assemble(range: ByteRange): Uint8Array {
    const result = new Uint8Array(range.length);
    for (const segment of this.segments) this.copyOverlap(segment, range, result);
    return result;
  }

  private copyOverlap(segment: Segment, range: ByteRange, into: Uint8Array): void {
    const start = Math.max(segment.range.offset, range.offset);
    const end = Math.min(segment.range.end, range.end);
    if (start >= end) return;
    into.set(
      segment.bytes.subarray(start - segment.range.offset, end - segment.range.offset),
      start - range.offset,
    );
  }
}
