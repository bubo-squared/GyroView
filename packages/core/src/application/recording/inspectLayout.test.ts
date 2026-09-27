import { describe, expect, it } from 'vitest';

import { inspectLayout } from './inspectLayout';
import { RecordType } from '../../domain/format/constants';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';
import { loadFixture } from '../../../test/support/fixtures';
import { officeRecords } from '../../../test/support/officeRecording';

describe('inspectLayout', () => {
  it('maps an inst-wrapped indexed file: boxes, trailer version, payload start and records', async () => {
    const file = officeRecords({ hasExposure: false }).buildIndexed({
      alignment: 4096,
      wrapInInstBox: true,
    });
    const layout = await inspectLayout(new InMemoryRandomAccessSource(file.bytes));
    expect(layout).toMatchObject({
      fileSize: file.bytes.byteLength,
      trailerWrapper: 'inst-box',
      trailerVersion: 3,
      trailerPayloadStart: file.payloadStart,
    });
    expect(layout.boxes.map((box) => box.type)).toEqual(['ftyp', 'moov', 'inst']);
    expect(layout.records.map((record) => record.id)).toEqual([RecordType.Info, RecordType.Gyro]);
  });

  it('reports a trailer appended bare after the boxes', async () => {
    const file = officeRecords({ hasExposure: false }).buildContiguous();
    const layout = await inspectLayout(new InMemoryRandomAccessSource(file.bytes));
    expect(layout.trailerWrapper).toBe('bare');
  });

  it('maps the ONE R file: its boxes, a bare trailer and every record by id', async () => {
    const layout = await inspectLayout(
      new InMemoryRandomAccessSource(loadFixture('thirdparty/insta360py/sample.insv')),
    );
    expect(layout.boxes.map((box) => box.type)).toEqual(['ftyp', 'moov', 'mdat']);
    expect(layout.trailerWrapper).toBe('bare');
    expect(layout.records.map((record) => record.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
  });

  it('maps the X5 file: an inst-wrapped trailer with thirteen records', async () => {
    const layout = await inspectLayout(
      new InMemoryRandomAccessSource(loadFixture('thirdparty/insta360py/x5_indexed.insv')),
    );
    expect(layout.trailerWrapper).toBe('inst-box');
    expect(layout.records).toHaveLength(13);
  });
});
