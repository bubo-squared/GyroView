import { open, type FileHandle } from 'node:fs/promises';

import { GyroViewError, type ByteRange, type RandomAccessSource } from '@gyroview/core';

/**
 * RandomAccessSource over a local file. Used by the CLI and by integration tests against the
 * real recordings; the browser uses the fetch adapter instead.
 */
export class FileRandomAccessSource implements RandomAccessSource {
  private constructor(
    private readonly handle: FileHandle,
    private readonly totalSize: number,
  ) {}

  public static async open(path: string): Promise<FileRandomAccessSource> {
    const handle = await open(path, 'r');
    const { size } = await handle.stat();
    return new FileRandomAccessSource(handle, size);
  }

  public size(): Promise<number> {
    return Promise.resolve(this.totalSize);
  }

  public async read(range: ByteRange): Promise<Uint8Array> {
    if (!range.fitsWithin(this.totalSize)) {
      throw new GyroViewError(
        'invalid-byte-range',
        `range ${range.offset}+${range.length} exceeds the ${this.totalSize}-byte file`,
      );
    }
    const buffer = new Uint8Array(range.length);
    let filled = 0;
    while (filled < range.length) {
      const { bytesRead } = await this.handle.read(
        buffer,
        filled,
        range.length - filled,
        range.offset + filled,
      );
      if (bytesRead === 0)
        throw new GyroViewError('invalid-byte-range', `file ended before ${range.end}`);
      filled += bytesRead;
    }
    return buffer;
  }

  public async close(): Promise<void> {
    await this.handle.close();
  }
}
