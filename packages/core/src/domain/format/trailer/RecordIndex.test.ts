import { describe, expect, it } from 'vitest';

import { RecordIndex } from './RecordIndex';
import { captureError } from '../../../../test/support/errors';
import { loadFixture, loadManifest } from '../../../../test/support/fixtures';

const manifest = loadManifest();

describe('RecordIndex', () => {
  it.each(['office', 'sailing'] as const)('locates every record of the %s recording', (sample) => {
    const entry = manifest[sample];
    const indexBytes = loadFixture(`x5/${sample}/footer-with-index.bin`).subarray(
      0,
      entry.indexSize,
    );

    const index = RecordIndex.parse(indexBytes, entry.payloadStart);

    const located = Object.fromEntries(
      index.records.map((record) => [
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
    const index = RecordIndex.parse(new Uint8Array(30), 1000);
    expect(index.records).toEqual([]);
  });

  it('rejects an index whose size is not a whole number of slots', () => {
    expect(captureError(() => RecordIndex.parse(new Uint8Array(25), 0))).toMatchObject({
      code: 'invalid-trailer',
    });
  });
});
