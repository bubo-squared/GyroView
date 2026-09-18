import { describe, expect, it } from 'vitest';

import { ByteReader } from './ByteReader';
import { captureError } from '../../../test/support/errors';

const bytes = new Uint8Array([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x41, 0x42, 0x43, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xf8, 0x3f,
]);
const reader = new ByteReader(bytes);

describe('ByteReader', () => {
  it('reports its length', () => {
    expect(reader.length).toBe(bytes.byteLength);
  });

  it('reads little-endian unsigned integers at an offset', () => {
    expect(reader.uint8At(0)).toBe(0x01);
    expect(reader.uint16LeAt(0)).toBe(0x02_01);
    expect(reader.uint32LeAt(0)).toBe(0x04_03_02_01);
  });

  it('reads a little-endian uint64 that fits in a safe integer', () => {
    const small = new ByteReader(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x00, 0x00, 0x00]));
    expect(small.uint64LeAt(0)).toBe(0x05_04_03_02_01);
  });

  it('reads big-endian integers for ISOBMFF box headers', () => {
    expect(reader.uint32BeAt(0)).toBe(0x01_02_03_04);
    const large = new ByteReader(new Uint8Array([0, 0, 0, 1, 0x99, 0x69, 0xab, 0x8e]));
    expect(large.uint64BeAt(0)).toBe(6_868_806_542);
  });

  it('reads a little-endian float64', () => {
    expect(reader.float64LeAt(12)).toBe(1.5);
  });

  it('reads ASCII text', () => {
    expect(reader.asciiAt(8, 3)).toBe('ABC');
  });

  it('returns a view for raw bytes', () => {
    const view = reader.bytesAt(8, 2);
    expect(view).toEqual(new Uint8Array([0x41, 0x42]));
    expect(view.buffer).toBe(bytes.buffer);
  });

  it('works over a subarray with a non-zero byte offset', () => {
    const inner = new ByteReader(bytes.subarray(8, 11));
    expect(inner.asciiAt(0, 3)).toBe('ABC');
    expect(inner.length).toBe(3);
  });

  it('rejects reads past the end', () => {
    expect(captureError(() => reader.uint32LeAt(18))).toMatchObject({
      code: 'binary-out-of-bounds',
      message: 'read of 4 byte(s) at offset 18 exceeds 20 available',
    });
    expect(captureError(() => reader.bytesAt(0, 21))).toMatchObject({
      code: 'binary-out-of-bounds',
    });
  });

  it('rejects negative offsets', () => {
    expect(captureError(() => reader.uint8At(-1))).toMatchObject({ code: 'binary-out-of-bounds' });
  });

  it('rejects 64-bit values beyond the safe integer range', () => {
    const huge = new ByteReader(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
    expect(captureError(() => huge.uint64LeAt(0))).toMatchObject({ code: 'binary-unsafe-integer' });
  });
});
