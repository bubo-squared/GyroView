import { GyroViewError, type ByteRange, type RandomAccessSource } from '@gyroview/core';

/**
 * RandomAccessSource over a `Blob` (a `File` from a picker or a drop). Each read slices the
 * blob, which browsers serve from disk without loading the whole file, so multi-gigabyte
 * recordings play from local storage the same way they play from a URL.
 */
export class BlobRandomAccessSource implements RandomAccessSource {
  public constructor(private readonly blob: Blob) {}

  public size(): Promise<number> {
    return Promise.resolve(this.blob.size);
  }

  public async read(range: ByteRange): Promise<Uint8Array> {
    if (!range.fitsWithin(this.blob.size)) {
      throw new GyroViewError(
        'invalid-byte-range',
        `range ${range.offset}+${range.length} exceeds the ${this.blob.size}-byte blob`,
      );
    }
    if (range.length === 0) return new Uint8Array();
    const bytes = new Uint8Array(await this.slice(range).arrayBuffer());
    if (bytes.byteLength !== range.length) {
      throw new GyroViewError(
        'source-truncated',
        `the blob yielded ${bytes.byteLength} bytes for a ${range.length}-byte range at ${range.offset}; the file may have changed on disk`,
      );
    }
    return bytes;
  }

  private slice(range: ByteRange): Blob {
    try {
      return this.blob.slice(range.offset, range.end);
    } catch (error) {
      throw new GyroViewError('source-unreadable', 'the blob could not be read', { cause: error });
    }
  }
}
