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

  it('refuses to run past the end of a source, naming it', () => {
    const error = captureError(() => {
      ByteRange.of(91, 10).ensureWithin(100, 'blob');
    });
    expect(error).toMatchObject({
      code: 'invalid-byte-range',
      message: 'range 91+10 exceeds the 100-byte blob',
    });
    expect(() => {
      ByteRange.of(90, 10).ensureWithin(100, 'blob');
    }).not.toThrow();
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

  it('overlaps another range when they share a byte', () => {
    const range = ByteRange.of(10, 5);
    expect(range.overlaps(ByteRange.of(14, 3))).toBe(true);
    expect(range.overlaps(ByteRange.of(5, 6))).toBe(true);
    expect(range.overlaps(ByteRange.of(15, 3))).toBe(false);
    expect(range.overlaps(ByteRange.of(5, 5))).toBe(false);
  });

  it('overlaps no range when either is empty', () => {
    expect(ByteRange.of(10, 5).overlaps(ByteRange.of(12, 0))).toBe(false);
    expect(ByteRange.of(12, 0).overlaps(ByteRange.of(10, 5))).toBe(false);
  });

  it('contains a range lying wholly within it, up to both its ends', () => {
    const range = ByteRange.of(10, 5);
    expect(range.contains(ByteRange.of(10, 5))).toBe(true);
    expect(range.contains(ByteRange.of(9, 3))).toBe(false);
    expect(range.contains(ByteRange.of(13, 3))).toBe(false);
  });
});
