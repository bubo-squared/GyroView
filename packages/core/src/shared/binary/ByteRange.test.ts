import { describe, expect, it } from 'vitest';

import { ByteRange } from './ByteRange';
import { captureError } from '../../../test/support/errors';

describe('ByteRange', () => {
  it('exposes its exclusive end', () => {
    expect(ByteRange.of(10, 5).end).toBe(15);
  });

  it('takes the last bytes of a source', () => {
    const range = ByteRange.lastOf(100, 72);
    expect([range.offset, range.length]).toEqual([28, 72]);
  });

  it('knows whether it fits within a source', () => {
    expect(ByteRange.of(90, 10).fitsWithin(100)).toBe(true);
    expect(ByteRange.of(91, 10).fitsWithin(100)).toBe(false);
  });

  it('compares by value', () => {
    expect(ByteRange.of(1, 2).equals(ByteRange.of(1, 2))).toBe(true);
    expect(ByteRange.of(1, 2).equals(ByteRange.of(1, 3))).toBe(false);
  });

  it.each([
    [-1, 4],
    [1.5, 4],
    [0, -1],
    [NaN, 1],
  ])('rejects offset %d with length %d', (offset, length) => {
    expect(captureError(() => ByteRange.of(offset, length))).toMatchObject({
      code: 'invalid-byte-range',
    });
  });

  it('rejects taking more trailing bytes than the source holds', () => {
    expect(captureError(() => ByteRange.lastOf(10, 11))).toMatchObject({
      code: 'invalid-byte-range',
      message: 'cannot take 11 bytes from a 10-byte source',
    });
  });
});
