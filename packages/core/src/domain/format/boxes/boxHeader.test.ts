import { describe, expect, it } from 'vitest';

import { boxHeaderOf } from './boxHeader';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { encodeBox } from '../../../testing/encodeBox';

function headerOf(bytes: Uint8Array, room = bytes.byteLength): ReturnType<typeof boxHeaderOf> {
  return boxHeaderOf(new ByteReader(bytes), room);
}

function largeHeader(type: string, size: bigint): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1);
  bytes.set(new TextEncoder().encode(type), 4);
  view.setBigUint64(8, size);
  return bytes;
}

const MOOV_OF_20_BYTES = encodeBox('moov', new Uint8Array(12));
const EMPTY_FREE = encodeBox('free', new Uint8Array());
const TRAK_OF_20_BYTES = encodeBox('trak', new Uint8Array(12));

describe('boxHeaderOf', () => {
  it('reads the type and the size of a box with a 32-bit size', () => {
    expect(headerOf(MOOV_OF_20_BYTES)).toEqual({
      type: 'moov',
      size: 20,
      headerSize: 8,
    });
  });

  it('reads a large size, as the mdat of a recording over 4 GiB has', () => {
    expect(headerOf(largeHeader('mdat', 6_868_806_542n), 6_868_806_542)).toEqual({
      type: 'mdat',
      size: 6_868_806_542,
      headerSize: 16,
    });
  });

  it('takes size zero to reach as far as there is room', () => {
    const open = new Uint8Array(8);
    open.set(new TextEncoder().encode('mdat'), 4);
    expect(headerOf(open, 500)).toEqual({ type: 'mdat', size: 500, headerSize: 8 });
  });

  it('accepts a box that fills its room exactly', () => {
    expect(headerOf(EMPTY_FREE, 8)).toMatchObject({ size: 8 });
  });

  it('refuses a box that runs past its room', () => {
    expect(headerOf(TRAK_OF_20_BYTES, 19)).toBeUndefined();
  });

  it('refuses a declared size smaller than the header', () => {
    expect(headerOf(new Uint8Array([0, 0, 0, 4, 0x6d, 0x6f, 0x6f, 0x76]))).toBeUndefined();
  });

  it('refuses a type that is not four printable characters', () => {
    expect(headerOf(new Uint8Array([0, 0, 0, 8, 1, 2, 3, 4]))).toBeUndefined();
  });

  it('refuses a large size beyond the safe integers, which no real box has', () => {
    expect(headerOf(largeHeader('mdat', 0xff_ff_ff_ff_ff_ff_ff_ffn), Infinity)).toBeUndefined();
  });

  it('refuses a large-size marker without the room for the large size', () => {
    expect(headerOf(largeHeader('mdat', 64n).subarray(0, 8), 8)).toBeUndefined();
  });

  it('refuses fewer bytes than a header', () => {
    expect(headerOf(new Uint8Array([0, 0, 0, 8, 0x6d, 0x6f]))).toBeUndefined();
  });
});
