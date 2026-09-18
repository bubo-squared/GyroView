import { describe, expect, it } from 'vitest';

import { ExposureRecordParser } from './ExposureRecordParser';
import { microseconds } from '../../../shared/units/time';
import { captureError } from '../../../../test/support/errors';
import { loadFixture } from '../../../../test/support/fixtures';

const parser = new ExposureRecordParser();
const OFFICE_FIRST_FRAME_TIMESTAMP = microseconds(921_751_839);

describe('ExposureRecordParser on the office X5 recording', () => {
  const head = parser.parse(loadFixture('x5/office/record-04-exposure-first16.bin'));

  it('decodes one entry per 16 bytes', () => {
    expect(head.length).toBe(16);
  });

  it('reads capture timestamps in microseconds and shutter time in seconds', () => {
    expect(head.entryAt(0).timestamp).toBe(921_651_739);
    expect(head.entryAt(0).exposure).toBeCloseTo(1 / 640, 8);
    expect(head.entryAt(1).timestamp - head.entryAt(0).timestamp).toBeCloseTo(1e6 / 59.94, -2);
  });

  it('finds the entry of the first encoded frame six pre-roll entries in', () => {
    const index = head.indexAtOrAfter(OFFICE_FIRST_FRAME_TIMESTAMP);
    expect(index).toBe(6);
    expect(head.entryAt(index).timestamp).toBe(OFFICE_FIRST_FRAME_TIMESTAMP);
  });

  it('returns the length when every entry precedes the timestamp', () => {
    expect(head.indexAtOrAfter(microseconds(2_000_000_000))).toBe(16);
  });

  it('reads the tail of the record', () => {
    const tail = parser.parse(loadFixture('x5/office/record-04-exposure-last16.bin'));
    expect(tail.entryAt(15).timestamp).toBe(1_183_876_117);
  });
});

describe('ExposureRecordParser validation', () => {
  it('rejects a payload that is not a whole number of entries', () => {
    expect(captureError(() => parser.parse(new Uint8Array(17)))).toMatchObject({
      code: 'invalid-exposure-record',
    });
  });

  it('decodes an empty payload to an empty record', () => {
    expect(parser.parse(new Uint8Array()).length).toBe(0);
  });
});
