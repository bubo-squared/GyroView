import { describe, expect, it } from 'vitest';

import { RecordHeader } from './RecordHeader';
import { RECORD_HEADER_SIZE, RecordType, TRAILER_FOOTER_SIZE } from '../constants';
import { captureError } from '../../../../test/support/errors';
import { loadFixture, loadManifest } from '../../../../test/support/fixtures';

const manifest = loadManifest();

describe('RecordHeader', () => {
  it('parses the header of the index record that precedes the footer', () => {
    const tail = loadFixture('x5/office/footer-with-index.bin');
    const headerStart = tail.byteLength - TRAILER_FOOTER_SIZE - RECORD_HEADER_SIZE;
    const header = RecordHeader.parse(tail.subarray(headerStart, headerStart + RECORD_HEADER_SIZE));
    expect(header).toMatchObject({
      id: RecordType.Index,
      format: 0,
      payloadSize: manifest.office.indexSize,
    });
  });

  it('parses format, id and size in that byte order', () => {
    const header = RecordHeader.parse(new Uint8Array([0x01, 0x03, 0x10, 0x27, 0x00, 0x00]));
    expect(header).toMatchObject({ format: 1, id: 3, payloadSize: 10_000 });
  });

  it('rejects a block of the wrong length', () => {
    expect(captureError(() => RecordHeader.parse(new Uint8Array(5)))).toMatchObject({
      code: 'invalid-trailer',
    });
  });
});
