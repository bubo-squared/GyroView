import { describe, expect, it } from 'vitest';

import { parseRecordIndex } from './parseRecordIndex';
import { captureError } from '../../../../test/support/errors';
import { loadFixture, loadManifest } from '../../../../test/support/fixtures';

const manifest = loadManifest();

describe('parseRecordIndex', () => {
  it.each(['office', 'sailing'] as const)('locates every record of the %s recording', (sample) => {
    const entry = manifest[sample];
    const indexBytes = loadFixture(`x5/${sample}/footer-with-index.bin`).subarray(
      0,
      entry.indexSize,
    );

    const records = parseRecordIndex(indexBytes, entry.payloadStart);

    const located = Object.fromEntries(
      records.map((record) => [
        String(record.id),
        { format: record.format, size: record.payload.length, offset: record.payload.offset },
      ]),
    );
    const expected = Object.fromEntries(
      Object.entries(entry.records).map(([id, record]) => [
        id,
        { format: record.format, size: record.size, offset: record.offset },
      ]),
    );
    expect(located).toEqual(expected);
  });

  it('skips empty slots', () => {
    expect(parseRecordIndex(new Uint8Array(30), 1000)).toEqual([]);
  });

  it('rejects an index whose size is not a whole number of slots', () => {
    expect(captureError(() => parseRecordIndex(new Uint8Array(25), 0))).toMatchObject({
      code: 'invalid-trailer',
    });
  });
});
