import { describe, expect, it } from 'vitest';

import type { ByteStream } from '../ports/ByteStream';
import { ByteRange } from '../shared/binary/ByteRange';

const CONTENT = Uint8Array.from({ length: 64 }, (_, index) => index * 3);

async function bytesOf(stream: ByteStream, range: ByteRange): Promise<number[]> {
  const chunks = await Array.fromAsync(stream.stream(range));
  return chunks.flatMap((chunk) => [...chunk]);
}

/**
 * Behaviour every ByteStream must exhibit, the simulated link and the real adapters alike.
 * Adapters call this from their own test files with a factory that serves the given bytes.
 */
export function describeByteStreamContract(
  name: string,
  createStream: (bytes: Uint8Array) => Promise<ByteStream>,
): void {
  describe(`ByteStream contract (${name})`, () => {
    it("streams a range's bytes in order, every one of them", async () => {
      const stream = await createStream(CONTENT);
      await expect(bytesOf(stream, ByteRange.of(5, 40))).resolves.toEqual([
        ...CONTENT.subarray(5, 45),
      ]);
    });

    it('streams the last bytes of the file', async () => {
      const stream = await createStream(CONTENT);
      const last = ByteRange.lastOf(CONTENT.byteLength, 7);
      await expect(bytesOf(stream, last)).resolves.toEqual([...CONTENT.subarray(-7)]);
    });

    it('streams an empty range as no chunk at all', async () => {
      const stream = await createStream(CONTENT);
      const chunks = await Array.fromAsync(stream.stream(ByteRange.of(10, 0)));
      expect(chunks).toEqual([]);
    });

    it('fails a range past the end with invalid-byte-range', async () => {
      const stream = await createStream(CONTENT);
      await expect(bytesOf(stream, ByteRange.of(60, 10))).rejects.toMatchObject({
        code: 'invalid-byte-range',
      });
    });

    it('gives a range up when returned, a chunk still awaited coming as the end', async () => {
      const stream = await createStream(CONTENT);
      const chunks = stream.stream(ByteRange.of(0, CONTENT.byteLength))[Symbol.asyncIterator]();
      const awaited = chunks.next();
      await expect(chunks.return?.()).resolves.toMatchObject({ done: true });
      await expect(awaited).resolves.toMatchObject({ done: true });
      await expect(chunks.next()).resolves.toMatchObject({ done: true });
    });
  });
}
