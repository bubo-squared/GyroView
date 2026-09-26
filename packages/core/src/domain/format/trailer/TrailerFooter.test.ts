import { describe, expect, it } from 'vitest';

import { TrailerFooter } from './TrailerFooter';
import { TRAILER_FOOTER_SIZE } from '../constants';
import { captureError } from '../../../../test/support/errors';
import { loadFixture, loadManifest } from '../../../../test/support/fixtures';

const manifest = loadManifest();

function footerBytesOf(sample: 'office' | 'sailing'): Uint8Array {
  const tail = loadFixture(`x5/${sample}/footer-with-index.bin`);
  return tail.subarray(tail.byteLength - TRAILER_FOOTER_SIZE);
}

describe('TrailerFooter', () => {
  it.each(['office', 'sailing'] as const)(
    'parses the trailer size and version of the %s recording',
    (sample) => {
      const footer = TrailerFooter.parse(footerBytesOf(sample));
      expect(footer.trailerSize).toBe(manifest[sample].trailerSize);
      expect(footer.version).toBe(manifest[sample].trailerVersion);
    },
  );

  it('rejects a block of the wrong length', () => {
    expect(captureError(() => TrailerFooter.parse(new Uint8Array(71)))).toMatchObject({
      code: 'invalid-trailer',
    });
  });

  it('rejects a block without the magic', () => {
    const corrupted = new Uint8Array(footerBytesOf('office'));
    corrupted[TRAILER_FOOTER_SIZE - 1] = 0x00;
    expect(captureError(() => TrailerFooter.parse(corrupted))).toMatchObject({
      code: 'invalid-trailer',
      message: expect.stringContaining('magic') as string,
    });
  });
});
