import { describe, expect, it } from 'vitest';

import { encodeBox, encodeFullBox, encodeLargeBox } from './encodeBox';
import { boxHeaderOf } from '../domain/format/boxes/boxHeader';
import { ByteReader } from '../shared/binary/ByteReader';

const PAYLOAD = new Uint8Array([1, 2, 3]);

function headerOf(bytes: Uint8Array): ReturnType<typeof boxHeaderOf> {
  return boxHeaderOf(new ByteReader(bytes), bytes.byteLength);
}

describe('encodeBox', () => {
  it('writes a box with a 32-bit size before its payload', () => {
    const box = encodeBox('free', PAYLOAD);
    expect(headerOf(box)).toEqual({ type: 'free', size: 11, headerSize: 8 });
    expect([...box.subarray(8)]).toEqual([1, 2, 3]);
  });
});

describe('encodeFullBox', () => {
  it('writes the version and the flags before the payload', () => {
    const box = encodeFullBox('mvhd', { version: 1, flags: 0x00_00_03 }, PAYLOAD);
    expect(headerOf(box)).toEqual({ type: 'mvhd', size: 15, headerSize: 8 });
    expect([...box.subarray(8)]).toEqual([1, 0, 0, 3, 1, 2, 3]);
  });

  it('writes no flags when none are given', () => {
    const box = encodeFullBox('stsz', { version: 0 }, new Uint8Array());
    expect([...box.subarray(8)]).toEqual([0, 0, 0, 0]);
  });
});

describe('encodeLargeBox', () => {
  it('writes a 64-bit size, as the media data of a recording over 4 GiB has', () => {
    const box = encodeLargeBox('mdat', PAYLOAD);
    expect(headerOf(box)).toEqual({ type: 'mdat', size: 19, headerSize: 16 });
    expect([...box.subarray(16)]).toEqual([1, 2, 3]);
  });
});
