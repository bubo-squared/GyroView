import { describe, expect, it } from 'vitest';

import { InMemoryRandomAccessSource } from './InMemoryRandomAccessSource';
import { describeRandomAccessSourceContract } from './RandomAccessSource.contract';
import { ByteRange } from '../shared/binary/ByteRange';

describeRandomAccessSourceContract((bytes) =>
  Promise.resolve(new InMemoryRandomAccessSource(bytes)),
);

describe('InMemoryRandomAccessSource', () => {
  it('records every range it was asked for, so tests can assert on I/O patterns', async () => {
    const source = new InMemoryRandomAccessSource(new Uint8Array(16));
    await source.read(ByteRange.of(0, 4));
    await source.read(ByteRange.lastOf(16, 8));
    expect(source.reads.map((range) => [range.offset, range.length])).toEqual([
      [0, 4],
      [8, 8],
    ]);
  });
});
