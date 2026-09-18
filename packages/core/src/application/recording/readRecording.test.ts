import { describe, expect, it } from 'vitest';

import { readRecording } from './readRecording';
import { RecordType } from '../../domain/format/constants';
import { CalibrationVersion } from '../../domain/optics/LensCalibration';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';
import { TrailerFixtureBuilder } from '../../../test/support/TrailerFixtureBuilder';
import { loadFixture } from '../../../test/support/fixtures';
import { minimalMp4Prefix } from '../../../test/support/mp4Prefix';
import {
  OFFICE_FIRST_GYRO_SAMPLE,
  RAW_FULL_SCALE,
  RAW_ZERO_POINT,
} from '../../../test/support/officeGyroSample';

const PROTOBUF = 1;

function officeRecords(): TrailerFixtureBuilder {
  return new TrailerFixtureBuilder()
    .withPrefix(minimalMp4Prefix())
    .addRecord({
      id: RecordType.Info,
      format: PROTOBUF,
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

describe('readRecording on synthetic X5 files', () => {
  it('assembles boxes, trailer, info and calibration from an inst-wrapped indexed file', async () => {
    const file = officeRecords().buildIndexed({ alignment: 4096, wrapInInstBox: true });
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));

    expect(recording.boxes.map((box) => box.type)).toEqual(['ftyp', 'moov', 'inst']);
    expect(recording.trailerWrapper).toBe('inst-box');
    expect(recording.trailerVersion).toBe(3);
    expect(recording.trailerPayloadStart).toBe(file.payloadStart);
    expect(recording.recordSummaries().map((record) => record.id)).toEqual([
      RecordType.Info,
      RecordType.Gyro,
      RecordType.Exposure,
    ]);
    expect(recording.info.model).toBe('Insta360 X5');
    expect(recording.calibration.calibration?.version).toBe(CalibrationVersion.Mei);
    expect(recording.calibration.warnings).toEqual([]);
    expect(recording.layoutHints).toEqual({ fileLayout: 2, trackOrder: 1 });
    expect(recording.fileSize).toBe(file.bytes.byteLength);
  });

  it('reads a bare contiguous trailer and reports it as such', async () => {
    const file = officeRecords().buildContiguous();
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));
    expect(recording.trailerWrapper).toBe('bare');
  });

  it('decodes the gyro record with the ranges from the info record', async () => {
    const recording = await readRecording(
      new InMemoryRandomAccessSource(officeRecords().buildContiguous().bytes),
    );
    const gyro = await recording.readGyroRecord();
    expect(gyro?.layout).toBe('raw');
    expect(gyro?.track.length).toBe(2000);
    const expected =
      ((OFFICE_FIRST_GYRO_SAMPLE.rawAcceleration[0] - RAW_ZERO_POINT) * 32) / RAW_FULL_SCALE;
    expect(gyro?.track.sampleAt(0).acceleration[0]).toBeCloseTo(expected, 5);
  });

  it('decodes the exposure record and derives the capture clock in microseconds', async () => {
    const recording = await readRecording(
      new InMemoryRandomAccessSource(officeRecords().buildContiguous().bytes),
    );
    const exposure = await recording.readExposureRecord();
    expect(exposure?.length).toBe(16);
    await expect(recording.captureClockUnit()).resolves.toBe('microseconds');
    await expect(recording.gyroLayout()).resolves.toBe('raw');
    const clock = await recording.captureClock();
    expect(clock.firstFrameCaptureTime).toBe(921_751_839);
    expect(clock.gyroOffset).toBe(1.6);
    expect(exposure?.indexAtOrAfter(clock.firstFrameCaptureTime)).toBe(6);
  });

  it('reports missing gyro and exposure records as undefined rather than failing', async () => {
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({
        id: RecordType.Info,
        format: PROTOBUF,
        payload: loadFixture('x5/office/record-01-info.bin'),
      })
      .buildContiguous();
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));
    await expect(recording.readGyroRecord()).resolves.toBeUndefined();
    await expect(recording.readExposureRecord()).resolves.toBeUndefined();
  });

  it('fails with a typed error when the trailer has no info record', async () => {
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({ id: RecordType.Gyro, payload: new Uint8Array(20) })
      .buildContiguous();
    await expect(readRecording(new InMemoryRandomAccessSource(file.bytes))).rejects.toMatchObject({
      code: 'no-info-record',
    });
  });

  it('reports a recording without any calibration string as having none, and still opens it', async () => {
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({ id: RecordType.Info, format: PROTOBUF, payload: new Uint8Array() })
      .buildContiguous();
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));
    expect(recording.calibration).toEqual({ calibration: undefined, warnings: [] });
    expect(recording.info.model).toBeUndefined();
  });

  it('infers a float gyro layout from the record when the info record has no flag, and reads the clock in milliseconds', async () => {
    const floatSamples = new Uint8Array(56 * 2);
    const view = new DataView(floatSamples.buffer);
    view.setBigUint64(0, 5000n, true);
    view.setBigUint64(56, 5001n, true);
    const info = new Uint8Array([0xc0, 0x01, 0xd0, 0x0f]); // field 24 (first frame timestamp) = 2000
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({ id: RecordType.Info, format: PROTOBUF, payload: info })
      .addRecord({ id: RecordType.Gyro, payload: floatSamples })
      .buildContiguous();
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));
    await expect(recording.gyroLayout()).resolves.toBe('float');
    await expect(recording.captureClockUnit()).resolves.toBe('milliseconds');
    const clock = await recording.captureClock();
    expect(clock.firstFrameCaptureTime).toBe(2_000_000);
    const gyro = await recording.readGyroRecord();
    expect(gyro?.layout).toBe('float');
  });

  it('opens with one size lookup and reads boxes and trailer concurrently', async () => {
    const source = new InMemoryRandomAccessSource(officeRecords().buildContiguous().bytes);
    await readRecording(source);
    expect(source.sizeCalls).toBe(1);
  });

  it('fails with a typed error when the info record is not protobuf', async () => {
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({ id: RecordType.Info, format: 2, payload: new TextEncoder().encode('{}') })
      .buildContiguous();
    await expect(readRecording(new InMemoryRandomAccessSource(file.bytes))).rejects.toMatchObject({
      code: 'unsupported-info-format',
    });
  });
});

describe('readRecording on real trailers from other cameras (insta360py fixtures)', () => {
  it('reads the ONE R file: bare contiguous trailer, legacy calibration, gyro with one stray byte', async () => {
    const recording = await readRecording(
      new InMemoryRandomAccessSource(loadFixture('thirdparty/insta360py/sample.insv')),
    );
    expect(recording.boxes.map((box) => box.type)).toEqual(['ftyp', 'moov', 'mdat']);
    expect(recording.trailerWrapper).toBe('bare');
    expect(recording.info).toMatchObject({
      model: 'Insta360 OneR',
      frameRate: 30,
      isRawGyro: true,
      ptsType: 2,
    });
    expect(recording.calibration.calibration?.version).toBe(CalibrationVersion.Legacy);
    expect(recording.calibration.calibration?.canvas).toEqual({ width: 6080, height: 3040 });
    expect(recording.recordSummaries().map((record) => record.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12,
    ]);

    const gyro = await recording.readGyroRecord();
    expect(gyro).toMatchObject({ layout: 'raw', strayBytes: 1 });
    expect(gyro?.track.length).toBe(1178);
    const track = gyro!.track;
    expect(track.sampleAt(1).captureTime - track.sampleAt(0).captureTime).toBe(1000);

    const exposure = await recording.readExposureRecord();
    expect(exposure?.length).toBe(40);
    const clock = await recording.captureClock();
    expect(exposure?.indexAtOrAfter(clock.firstFrameCaptureTime)).toBeLessThan(40);
  });

  it('reads the X5 file: inst-wrapped indexed trailer without layout hints', async () => {
    const recording = await readRecording(
      new InMemoryRandomAccessSource(loadFixture('thirdparty/insta360py/x5_indexed.insv')),
    );
    expect(recording.trailerWrapper).toBe('inst-box');
    expect(recording.info).toMatchObject({
      model: 'Insta360 X5',
      firmware: 'v1.11.6_build1',
      fileLayout: undefined,
    });
    expect(recording.calibration.calibration?.version).toBe(CalibrationVersion.Mei);
    expect(recording.recordSummaries()).toHaveLength(13);
    const gyro = await recording.readGyroRecord();
    expect(gyro?.track.length).toBe(12);
  });
});
