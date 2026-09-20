import { describe, expect, it } from 'vitest';

import { encodeAscii } from './ascii';
import { captureError } from '../../../test/support/errors';

describe('encodeAscii', () => {
  it('encodes each character as one byte', () => {
    expect(encodeAscii('moov')).toEqual(new Uint8Array([0x6d, 0x6f, 0x6f, 0x76]));
  });

  it('encodes the empty string as no bytes', () => {
    expect(encodeAscii('')).toEqual(new Uint8Array());
  });

  it('refuses characters beyond ASCII', () => {
    expect(captureError(() => encodeAscii('möv'))).toMatchObject({
      code: 'invariant-violation',
      message: '"möv" is not ASCII',
    });
  });
});
