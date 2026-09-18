import { describe, expect, it } from 'vitest';

import type { RandomAccessSource } from './RandomAccessSource';
import { ByteRange } from '../shared/binary/ByteRange';

const SAMPLE_CONTENT = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

/**
 * Behaviour every RandomAccessSource adapter must exhibit. Adapters call this from their own
 * test files with a factory that wraps the given bytes in the adapter under test.
 */
export function describeRandomAccessSourceContract(
  createSource: (bytes: Uint8Array) => Promise<RandomAccessSource>,
): void {
  describe('RandomAccessSource contract', () => {
    it('reports the total size', async () => {
      const source = await createSource(SAMPLE_CONTENT);
      await expect(source.size()).resolves.toBe(SAMPLE_CONTENT.byteLength);
    });

    it('reads an interior range exactly', async () => {
      const source = await createSource(SAMPLE_CONTENT);
      await expect(source.read(ByteRange.of(2, 3))).resolves.toEqual(new Uint8Array([30, 40, 50]));
    });

    it('reads the final bytes', async () => {
      const source = await createSource(SAMPLE_CONTENT);
      await expect(source.read(ByteRange.lastOf(SAMPLE_CONTENT.byteLength, 2))).resolves.toEqual(
        new Uint8Array([70, 80]),
      );
    });

    it('reads an empty range as an empty array', async () => {
      const source = await createSource(SAMPLE_CONTENT);
      await expect(source.read(ByteRange.of(4, 0))).resolves.toEqual(new Uint8Array());
    });

    it('rejects a range that runs past the end', async () => {
      const source = await createSource(SAMPLE_CONTENT);
      await expect(source.read(ByteRange.of(6, 4))).rejects.toThrow();
    });
  });
}
