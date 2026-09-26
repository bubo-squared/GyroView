import { ByteRange } from '@gyroview/core';
import { describeRandomAccessSourceContract } from '@gyroview/core/testing';
import { describe, expect, it } from 'vitest';

import { BlobRandomAccessSource } from './BlobRandomAccessSource';

/**
 * The contract hands out plain `Uint8Array`s; a blob part must own a real `ArrayBuffer`.
 */
function blobOf(bytes: Uint8Array): Blob {
  return new Blob([Uint8Array.from(bytes)]);
}

describeRandomAccessSourceContract((bytes) =>
  Promise.resolve(new BlobRandomAccessSource(blobOf(bytes))),
);

describe('BlobRandomAccessSource', () => {
  it('reads across the parts a blob was assembled from', async () => {
    const source = new BlobRandomAccessSource(
      new Blob([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]),
    );
    await expect(source.read(ByteRange.of(2, 3))).resolves.toEqual(new Uint8Array([3, 4, 5]));
  });

  it('reports a blob that yields fewer bytes than its size promised as truncated', async () => {
    const shrinking = new Blob([new Uint8Array(8)]);
    Object.defineProperty(shrinking, 'slice', {
      value: (): Blob => new Blob([new Uint8Array(2)]),
    });
    const source = new BlobRandomAccessSource(shrinking);
    await expect(source.read(ByteRange.of(0, 8))).rejects.toMatchObject({
      code: 'source-truncated',
    });
  });

  it('wraps a failing read, as of a file gone from disk, in a source-unreadable error', async () => {
    const broken = new Blob([new Uint8Array(8)]);
    const unreadable = new Blob([new Uint8Array(4)]);
    Object.defineProperty(unreadable, 'arrayBuffer', {
      value: (): Promise<never> => Promise.reject(new Error('gone')),
    });
    Object.defineProperty(broken, 'slice', { value: (): Blob => unreadable });
    const source = new BlobRandomAccessSource(broken);
    await expect(source.read(ByteRange.of(0, 4))).rejects.toMatchObject({
      code: 'source-unreadable',
      cause: expect.objectContaining({ message: 'gone' }) as unknown,
    });
  });
});
