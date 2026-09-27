import { describe, expect, it } from 'vitest';

import { EXPOSURE_DURATION_OFFSET, EXPOSURE_ENTRY_SIZE } from './exposureLayout';
import { parseExposureRecord } from './parseExposureRecord';
import type { ExposureRecord } from '../../../motion/exposure/ExposureRecord';
import { microseconds } from '../../../../shared/units/time';
import { loadFixture } from '../../../../../test/support/fixtures';

const OFFICE_FIRST_FRAME = microseconds(921_751_839);

function parsed(payload: Uint8Array): ExposureRecord {
  const record = parseExposureRecord(payload, microseconds);
  if (!record) throw new Error('the record was refused as damaged');
  return record;
}

describe('parseExposureRecord on the office X5 recording', () => {
  const record = parsed(loadFixture('x5/office/record-04-exposure-first16.bin'));

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
    const tail = parsed(loadFixture('x5/office/record-04-exposure-last16.bin'));
    expect(tail.entryAt(15).captureTime).toBe(1_183_876_117);
  });
});

describe('parseExposureRecord edge cases', () => {
  it('ignores a partial trailing entry', () => {
    expect(parsed(new Uint8Array(17)).length).toBe(1);
  });

  it('decodes an empty payload to an empty record', () => {
    expect(parsed(new Uint8Array()).length).toBe(0);
  });

  it('leaves out a record with an entry no clock could have stamped or no shutter could take', () => {
    const unsafeStamp = new Uint8Array(EXPOSURE_ENTRY_SIZE * 2);
    unsafeStamp[EXPOSURE_ENTRY_SIZE + 7] = 0xff;
    expect(parseExposureRecord(unsafeStamp, microseconds)).toBeUndefined();
    const notANumber = new Uint8Array(EXPOSURE_ENTRY_SIZE * 2);
    new DataView(notANumber.buffer).setFloat64(EXPOSURE_DURATION_OFFSET, NaN, true);
    expect(parseExposureRecord(notANumber, microseconds)).toBeUndefined();
  });
});
