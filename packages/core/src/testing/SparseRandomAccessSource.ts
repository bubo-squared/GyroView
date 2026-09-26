import type { RandomAccessSource } from '../ports/RandomAccessSource';
import { ByteRange } from '../shared/binary/ByteRange';

interface Segment {
  readonly range: ByteRange;
  readonly bytes: Uint8Array;
}

/**
 * Test double for very large files: reports an arbitrary size and serves bytes only where a
 * segment was placed, zeros elsewhere. Lets trailer tests use real multi-gigabyte offsets
 * with kilobytes of fixture data, and records every range read for I/O assertions.
 */
export class SparseRandomAccessSource implements RandomAccessSource {
  private readonly segments: Segment[] = [];
  private readonly readLog: ByteRange[] = [];
  private sizeLookups = 0;

  public constructor(private readonly totalSize: number) {}

  public get reads(): readonly ByteRange[] {
    return this.readLog;
  }

  /**
   * How often `size()` was asked, so tests can assert callers look it up once.
   */
  public get sizeCalls(): number {
    return this.sizeLookups;
  }

  public place(offset: number, bytes: Uint8Array): this {
    const range = ByteRange.of(offset, bytes.byteLength);
    range.ensureWithin(this.totalSize, 'sparse source');
    this.segments.push({ range, bytes });
    return this;
  }

  public size(): Promise<number> {
    this.sizeLookups += 1;
    return Promise.resolve(this.totalSize);
  }

  public read(range: ByteRange): Promise<Uint8Array> {
    this.readLog.push(range);
    return new Promise((resolve) => {
      range.ensureWithin(this.totalSize, 'sparse source');
      resolve(this.assemble(range));
    });
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
