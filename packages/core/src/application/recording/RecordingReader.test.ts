import { describe, expect, it } from 'vitest';

import { RecordingReader } from './RecordingReader';
import { RecordType } from '../../domain/format/constants';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';
import { TrailerFixtureBuilder } from '../../../test/support/TrailerFixtureBuilder';
import { loadFixture } from '../../../test/support/fixtures';
import { minimalMp4Prefix } from '../../../test/support/mp4Prefix';

const reader = new RecordingReader();

function officeRecords(): TrailerFixtureBuilder {
  return new TrailerFixtureBuilder()
    .withPrefix(minimalMp4Prefix())
    .addRecord({
      id: RecordType.Info,
      format: 1,
      payload: loadFixture('x5/office/record-01-info.bin'),
    })
    .addRecord({
      id: RecordType.Gyro,
      payload: loadFixture('x5/office/record-03-gyro-first2000.bin'),
    })
    .addRecord({
      id: RecordType.Exposure,
      payload: loadFixture('x5/office/record-04-exposure-first16.bin'),
    });
}

describe('RecordingReader', () => {
  it('assembles boxes, trailer, info and calibration from an inst-wrapped indexed file', async () => {
    const file = officeRecords().buildIndexed({ alignment: 4096, wrapInInstBox: true });
    const recording = await reader.read(new InMemoryRandomAccessSource(file.bytes));

    expect(recording.boxes.boxes.map((box) => box.type)).toEqual(['ftyp', 'moov', 'inst']);
    expect(recording.trailerWrapper).toBe('inst-box');
    expect(recording.trailer.recordIds).toEqual(
      expect.arrayContaining([RecordType.Info, RecordType.Gyro, RecordType.Exposure]),
    );
    expect(recording.info.model).toBe('Insta360 X5');
    expect(recording.calibration.calibration.version).toBe(3);
    expect(recording.calibration.warnings).toEqual([]);
  });

  it('reads a bare contiguous trailer and reports it as such', async () => {
    const file = officeRecords().buildContiguous();
    const recording = await reader.read(new InMemoryRandomAccessSource(file.bytes));
    expect(recording.trailerWrapper).toBe('bare');
    expect(recording.boxes.trailingBytes?.offset).toBe(file.payloadStart);
  });

  it('decodes the gyro track with the ranges from the info record', async () => {
    const file = officeRecords().buildContiguous();
    const recording = await reader.read(new InMemoryRandomAccessSource(file.bytes));
    const gyro = await recording.readGyroTrack();
    expect(gyro?.length).toBe(2000);
    expect(gyro?.sampleAt(0).acceleration[0]).toBeCloseTo((32_149 - 32_768) * (32 / 32_768), 5);
  });

  it('decodes the exposure record', async () => {
    const file = officeRecords().buildContiguous();
    const recording = await reader.read(new InMemoryRandomAccessSource(file.bytes));
    const exposure = await recording.readExposureRecord();
    expect(exposure?.length).toBe(16);
    expect(exposure?.entryAt(0).timestamp).toBe(921_651_739);
  });

  it('reports missing gyro and exposure records as undefined rather than failing', async () => {
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({
        id: RecordType.Info,
        format: 1,
        payload: loadFixture('x5/office/record-01-info.bin'),
      })
      .buildContiguous();
    const recording = await reader.read(new InMemoryRandomAccessSource(file.bytes));
    await expect(recording.readGyroTrack()).resolves.toBeUndefined();
    await expect(recording.readExposureRecord()).resolves.toBeUndefined();
  });

  it('fails with a typed error when the trailer has no info record', async () => {
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({ id: RecordType.Gyro, payload: new Uint8Array(20) })
      .buildContiguous();
    await expect(reader.read(new InMemoryRandomAccessSource(file.bytes))).rejects.toMatchObject({
      code: 'no-info-record',
    });
  });
});
