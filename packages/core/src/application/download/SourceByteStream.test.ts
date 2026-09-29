import { describe, expect, it } from 'vitest';

import { SourceByteStream } from './SourceByteStream';
import { ByteRange } from '../../shared/binary/ByteRange';
import { describeByteStreamContract } from '../../testing/ByteStream.contract';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';

describeByteStreamContract('over a random-access source', (bytes) =>
  Promise.resolve(new SourceByteStream(new InMemoryRandomAccessSource(bytes))),
);

describe('SourceByteStream', () => {
  it('reads a range whole, in one read of its source', async () => {
    const source = new InMemoryRandomAccessSource(
      Uint8Array.from({ length: 100 }, (_, index) => index),
    );
    const chunks = await Array.fromAsync(new SourceByteStream(source).stream(ByteRange.of(10, 50)));
    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([50]);
    expect(source.reads.map((range) => [range.offset, range.length])).toEqual([[10, 50]]);
  });

  it('reads nothing for a range given up before its first chunk', async () => {
    const source = new InMemoryRandomAccessSource(new Uint8Array(100));
    const chunks = new SourceByteStream(source).stream(ByteRange.of(0, 50))[Symbol.asyncIterator]();
    await chunks.return?.();
    await expect(chunks.next()).resolves.toMatchObject({ done: true });
    expect(source.reads).toEqual([]);
  });
});
