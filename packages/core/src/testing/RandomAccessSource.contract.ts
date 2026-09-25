import { describe, expect, it } from 'vitest';

import type { RandomAccessSource } from '../ports/RandomAccessSource';
import { ByteRange } from '../shared/binary/ByteRange';

const SAMPLE_CONTENT = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

/**
 * Behaviour every RandomAccessSource adapter must exhibit, including the error contract.
 * Adapters call this from their own test files with a factory that wraps the given bytes.
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

    it('rejects an empty range that starts past the end, as a non-empty one', async () => {
      const source = await createSource(SAMPLE_CONTENT);
      await expect(
        source.read(ByteRange.of(SAMPLE_CONTENT.byteLength + 1, 0)),
      ).rejects.toMatchObject({ code: 'invalid-byte-range' });
    });

    it('rejects a range that runs past the end with the invalid-byte-range code', async () => {
      const source = await createSource(SAMPLE_CONTENT);
      await expect(source.read(ByteRange.of(6, 4))).rejects.toMatchObject({
        code: 'invalid-byte-range',
      });
    });
  });
}
