import { describe, expect, it } from 'vitest';

import { SparseRandomAccessSource } from './SparseRandomAccessSource';
import { ByteRange } from '../shared/binary/ByteRange';

describe('SparseRandomAccessSource', () => {
  it('serves placed bytes at their offsets and zeros elsewhere', async () => {
    const source = new SparseRandomAccessSource(1_000_000).place(500, new Uint8Array([1, 2, 3]));
    await expect(source.read(ByteRange.of(499, 6))).resolves.toEqual(
      new Uint8Array([0, 1, 2, 3, 0, 0]),
    );
    await expect(source.size()).resolves.toBe(1_000_000);
  });

  it('assembles a read that spans two segments', async () => {
    const source = new SparseRandomAccessSource(100)
      .place(10, new Uint8Array([1, 1]))
      .place(14, new Uint8Array([2, 2]));
    await expect(source.read(ByteRange.of(9, 8))).resolves.toEqual(
      new Uint8Array([0, 1, 1, 0, 0, 2, 2, 0]),
    );
  });

  it('rejects placing a segment beyond its size', () => {
    expect(() => new SparseRandomAccessSource(10).place(8, new Uint8Array(4))).toThrow();
  });

  it('rejects reads beyond its size', async () => {
    await expect(new SparseRandomAccessSource(10).read(ByteRange.of(8, 4))).rejects.toMatchObject({
      code: 'invalid-byte-range',
    });
  });
});
