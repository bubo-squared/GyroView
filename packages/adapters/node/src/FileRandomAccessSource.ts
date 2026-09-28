import { open, type FileHandle } from 'node:fs/promises';

import {
  asGyroViewError,
  GyroViewError,
  type ByteRange,
  type RandomAccessSource,
} from '@gyroview/core';

/**
 * RandomAccessSource over a local file. Used by the CLI and by integration tests against the
 * real recordings; the browser reads URLs through the fetch adapter and files through the blob
 * adapter.
 */
export class FileRandomAccessSource implements RandomAccessSource {
  private constructor(
    private readonly handle: FileHandle,
    private readonly totalSize: number,
    private readonly path: string,
  ) {}

  public static async open(path: string): Promise<FileRandomAccessSource> {
    let handle: FileHandle;
    try {
      handle = await open(path, 'r');
    } catch (error) {
      throw new GyroViewError('source-unreadable', `cannot open ${path}`, { cause: error });
    }
    try {
      const stats = await handle.stat();
      if (!stats.isFile())
        throw new GyroViewError('source-unreadable', `${path} is not a regular file`);
      return new FileRandomAccessSource(handle, stats.size, path);
    } catch (error) {
      await handle.close();
      throw asGyroViewError(error, 'source-unreadable', `cannot stat ${path}`);
    }
  }

  public size(): Promise<number> {
    return Promise.resolve(this.totalSize);
  }

  public async read(range: ByteRange): Promise<Uint8Array> {
    range.ensureWithin(this.totalSize, `file ${this.path}`);
    const buffer = new Uint8Array(range.length);
    let filled = 0;
    while (filled < range.length) {
      const { bytesRead } = await this.handle.read(
        buffer,
        filled,
        range.length - filled,
        range.offset + filled,
      );
      if (bytesRead === 0) {
        throw new GyroViewError('source-truncated', `${this.path} ended before byte ${range.end}`);
      }
      filled += bytesRead;
    }
    return buffer;
  }

  public async close(): Promise<void> {
    await this.handle.close();
  }
}
