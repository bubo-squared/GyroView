import { describe, expect, it } from 'vitest';

import { decodeUtf8 } from './utf8';

describe('decodeUtf8', () => {
  it('decodes ASCII', () => {
    expect(decodeUtf8(new Uint8Array([0x49, 0x6e, 0x73, 0x74, 0x61]))).toBe('Insta');
  });

  it('decodes two-, three- and four-byte sequences', () => {
    expect(decodeUtf8(new Uint8Array([0xc3, 0xa9]))).toBe('é');
    expect(decodeUtf8(new Uint8Array([0xe2, 0x82, 0xac]))).toBe('€');
    expect(decodeUtf8(new Uint8Array([0xf0, 0x9f, 0x8e, 0xa5]))).toBe('🎥');
  });

  it('matches the platform decoder on mixed text', () => {
    const encoded = new TextEncoder().encode('Jedrenje – Carigradska 360°');
    expect(decodeUtf8(encoded)).toBe(new TextDecoder().decode(encoded));
  });

  it('replaces malformed bytes with U+FFFD', () => {
    expect(decodeUtf8(new Uint8Array([0x41, 0xff, 0x42]))).toBe('A�B');
    expect(decodeUtf8(new Uint8Array([0xe2, 0x82]))).toBe('�');
  });

  it('replaces an encoded surrogate, which UTF-8 forbids', () => {
    expect(decodeUtf8(new Uint8Array([0x41, 0xed, 0xa0, 0x80, 0x42]))).not.toMatch(
      /[\uD800-\uDFFF]/u,
    );
  });

  it('decodes more characters than a function call takes arguments', () => {
    const long = new Uint8Array(500_000).fill(0x61);
    expect(decodeUtf8(long)).toHaveLength(500_000);
  });

  it('decodes an empty array to an empty string', () => {
    expect(decodeUtf8(new Uint8Array())).toBe('');
  });
});
