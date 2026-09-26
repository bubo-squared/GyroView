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
    range.ensureWithin(this.blob.size, 'blob');
    if (range.length === 0) return new Uint8Array();
    const bytes = await this.bytesOf(this.blob.slice(range.offset, range.end));
    if (bytes.byteLength !== range.length) {
      throw new GyroViewError(
        'source-truncated',
        `the blob yielded ${bytes.byteLength} bytes for a ${range.length}-byte range at ${range.offset}; the file may have changed on disk`,
      );
    }
    return bytes;
  }

  /**
   * Reading is what fails, with a `NotReadableError`, when a picked file has changed or gone on
   * disk; slicing only clamps its arguments.
   */
  private async bytesOf(slice: Blob): Promise<Uint8Array> {
    try {
      return new Uint8Array(await slice.arrayBuffer());
    } catch (error) {
      throw new GyroViewError('source-unreadable', 'the blob could not be read', { cause: error });
    }
  }
}
