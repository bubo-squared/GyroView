import { describe, expect, it } from 'vitest';

import { parseExposureRecord } from './parseExposureRecord';
import { microseconds } from '../../../../shared/units/time';
import { loadFixture } from '../../../../../test/support/fixtures';

const OFFICE_FIRST_FRAME = microseconds(921_751_839);

describe('parseExposureRecord on the office X5 recording', () => {
  const record = parseExposureRecord(loadFixture('x5/office/record-04-exposure-first16.bin'));

  it('decodes one entry per 16 bytes', () => {
    expect(record.length).toBe(16);
  });

  it('reads capture times in microseconds and shutter time in seconds', () => {
    expect(record.entryAt(0).captureTime).toBe(921_651_739);
    expect(record.entryAt(0).shutterTime).toBeCloseTo(1 / 640, 8);
    expect(record.entryAt(1).captureTime - record.entryAt(0).captureTime).toBeCloseTo(
      1e6 / 59.94,
      -2,
    );
  });

  it('finds the entry of the first encoded frame six pre-roll entries in', () => {
    const index = record.indexAtOrAfter(OFFICE_FIRST_FRAME);
    expect(index).toBe(6);
    expect(record.entryAt(index).captureTime).toBe(OFFICE_FIRST_FRAME);
  });

  it('reads the tail of the record', () => {
    const tail = parseExposureRecord(loadFixture('x5/office/record-04-exposure-last16.bin'));
    expect(tail.entryAt(15).captureTime).toBe(1_183_876_117);
  });
});

describe('parseExposureRecord edge cases', () => {
  it('ignores a partial trailing entry', () => {
    expect(parseExposureRecord(new Uint8Array(17)).length).toBe(1);
  });

  it('decodes an empty payload to an empty record', () => {
    expect(parseExposureRecord(new Uint8Array()).length).toBe(0);
  });
});
