import { describe, expect, it } from 'vitest';

import { inspectRecording } from './inspectRecording';
import { RecordType } from '../../domain/format/constants';
import { GYRO_LAYOUT_PROBE_SIZE } from '../../domain/format/records/gyro/parseGyroRecord';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';
import { minimalInfoRecord } from '../../testing/minimalInfoRecord';
import { officeRecords, type OfficeRecordingParts } from '../../../test/support/officeRecording';

/**
 * Bytes no gyro sample layout explains: every field at its maximum.
 */
const UNEXPLAINED_GYRO = new Uint8Array(GYRO_LAYOUT_PROBE_SIZE).fill(0xff);

function inspectOffice(parts: OfficeRecordingParts = {}): ReturnType<typeof inspectRecording> {
  const file = officeRecords(parts).buildContiguous();
  return inspectRecording(new InMemoryRandomAccessSource(file.bytes));
}

describe('inspectRecording', () => {
  it('summarises the boxes, the trailer, the calibration, the gyro and the exposure', async () => {
    const file = officeRecords().buildContiguous();
    const inspection = await inspectRecording(new InMemoryRandomAccessSource(file.bytes));
    expect(inspection).toMatchObject({
      fileSize: file.bytes.byteLength,
      trailerWrapper: 'bare',
      payloadStart: file.payloadStart,
      info: { model: 'Insta360 X5' },
      calibration: { lenses: [{ lensIndex: 0 }, { lensIndex: 1 }] },
      gyro: { layout: 'raw', samples: 2000, damagedSamples: 0, unwrittenSamples: 0 },
      exposure: { entries: 16 },
    });
    expect(inspection.records.map((record) => record.id)).toEqual([
      RecordType.Info,
      RecordType.Gyro,
      RecordType.Exposure,
    ]);
  });

  it('reports a gyro layout it cannot tell, and the exposure it therefore leaves unread', async () => {
    // Without the info record's raw-gyro flag, only the samples could tell the layout.
    const info = minimalInfoRecord({ model: 'Insta360 X5' });
    const inspection = await inspectOffice({ info, gyro: UNEXPLAINED_GYRO });
    expect(inspection.gyro).toMatchObject({ unreadable: expect.any(String) as string });
    expect(inspection.exposure).toEqual({ unread: 'gyro layout unknown' });
  });

  it('has no gyro summary for a recording without a gyro record', async () => {
    const inspection = await inspectOffice({ hasGyro: false });
    expect(inspection.gyro).toBeUndefined();
  });
});
