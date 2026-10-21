import { describe, expect, it } from 'vitest';

import { microseconds, seconds, type Microseconds } from '../../shared/units/time';
import { readRecording } from './readRecording';
import type { Recording } from './Recording';
import { InfoRecordFormat, RecordType } from '../../domain/format/constants';
import { CalibrationVersion } from '../../domain/format/calibration/CalibrationVersion';
import type { CaptureClock } from '../../domain/motion/timing/CaptureClock';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';
import { minimalInfoFields } from '../../testing/minimalInfoRecord';
import { encodeProtobuf, stringField } from '../../testing/protobufWriter';
import { TrailerFixtureBuilder } from '../../testing/TrailerFixtureBuilder';
import { v6CalibrationString } from '../../../test/support/calibrationStrings';
import { loadFixture } from '../../../test/support/fixtures';
import { minimalMp4Prefix } from '../../../test/support/mp4Prefix';
import {
  officeRecording,
  officeRecords,
  type OfficeRecordingParts,
} from '../../../test/support/officeRecording';
import { trimRecord } from '../../../test/support/trimRecord';
import {
  OFFICE_FIRST_GYRO_SAMPLE,
  RAW_FULL_SCALE,
  RAW_ZERO_POINT,
} from '../../../test/support/officeGyroSample';

// 29.97 fps, whose info record says 30.
const NTSC_FRAME_DURATION = seconds(1001 / 30_000);

async function officeClock(parts: OfficeRecordingParts): Promise<CaptureClock | undefined> {
  const recording = await officeRecording(parts);
  return recording.captureClock();
}

async function firstFrameOf(recording: Recording): Promise<Microseconds> {
  const clock = await recording.captureClock();
  return clock?.firstFrameCaptureTime ?? microseconds(0);
}

describe('readRecording on synthetic X5 files', () => {
  it('assembles the info and calibration from an inst-wrapped indexed file', async () => {
    const file = officeRecords().buildIndexed({ alignment: 4096, wrapInInstBox: true });
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));

    expect(recording.info.model).toBe('Insta360 X5');
    expect(recording.calibration.calibration?.version).toBe(CalibrationVersion.Legacy);
    expect(recording.calibration.warnings).toEqual([]);
    expect(recording.info).toMatchObject({
      fileLayout: 'multi-track',
      trackOrder: 'stream-10-first',
    });
  });

  it('reads a bare contiguous trailer', async () => {
    const file = officeRecords().buildContiguous();
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));
    expect(recording.info.model).toBe('Insta360 X5');
  });

  it('decodes the gyro record with the ranges from the info record', async () => {
    const recording = await officeRecording();
    const gyro = await recording.readGyroRecord();
    expect(gyro?.layout).toBe('raw');
    expect(gyro?.track.length).toBe(2000);
    const expected =
      ((OFFICE_FIRST_GYRO_SAMPLE.rawAcceleration[0] - RAW_ZERO_POINT) * 32) / RAW_FULL_SCALE;
    expect(gyro?.track.sampleAt(0).acceleration[0]).toBeCloseTo(expected, 5);
  });

  it('decodes the exposure record and derives the capture clock in microseconds', async () => {
    const recording = await officeRecording();
    const exposure = await recording.readExposureRecord();
    expect(recording.listsExposureRecord).toBe(true);
    expect(exposure?.length).toBe(16);
    const clock = await recording.captureClock();
    expect(clock?.firstFrameCaptureTime).toBe(921_751_839);
    expect(clock?.gyroOffset).toBe(1.6);
    expect(exposure?.indexAtOrAfter(clock?.firstFrameCaptureTime ?? microseconds(0))).toBe(6);
  });

  it('starts the clock of a clip trimmed in the Insta360 app at the exposure of the frame it was cut at', async () => {
    const original = await officeRecording();
    const exposure = await original.readExposureRecord();
    const cutAt = (exposure?.indexAtOrAfter(await firstFrameOf(original)) ?? 0) + 3;
    const clock = await officeClock({ trim: trimRecord(3) });
    expect(clock?.firstFrameCaptureTime).toBe(exposure?.entryAt(cutAt).captureTime);
    expect(clock?.gyroOffset).toBe(1.6);
  });

  it('starts the clock of a trimmed clip without an exposure record that many frame durations later', async () => {
    const original = await firstFrameOf(await officeRecording({ hasExposure: false }));
    const trimmed = await officeRecording({ hasExposure: false, trim: trimRecord(3) });
    const clock = await trimmed.captureClock(NTSC_FRAME_DURATION);
    expect(clock?.firstFrameCaptureTime).toBe(original + Math.round(3 * NTSC_FRAME_DURATION * 1e6));
  });

  it('starts the clock of a trimmed clip without an exposure record or a frame duration where the original starts', async () => {
    const original = await firstFrameOf(await officeRecording({ hasExposure: false }));
    const clock = await officeClock({ hasExposure: false, trim: trimRecord(3) });
    expect(clock?.firstFrameCaptureTime).toBe(original);
  });

  it('starts the clock of a clip cut past the end of its exposure record where the original starts', async () => {
    const original = await officeRecording();
    const exposure = await original.readExposureRecord();
    const firstFrame = await firstFrameOf(original);
    expect((exposure?.indexAtOrAfter(firstFrame) ?? 0) + 10).toBeGreaterThanOrEqual(
      exposure?.length ?? 0,
    );
    const trimmed = await officeRecording({ trim: trimRecord(10) });
    const clock = await trimmed.captureClock(NTSC_FRAME_DURATION);
    expect(clock?.firstFrameCaptureTime).toBe(firstFrame);
  });

  it('starts the clock of a clip trimmed at its first frame, or with a damaged trim record, where the original starts', async () => {
    const original = await firstFrameOf(await officeRecording());
    for (const trim of [trimRecord(0), trimRecord(3, 'XXXX')]) {
      const clock = await officeClock({ trim });
      expect(clock?.firstFrameCaptureTime).toBe(original);
    }
  });

  it('reports missing gyro and exposure records as undefined rather than failing', async () => {
    const recording = await officeRecording({ hasGyro: false, hasExposure: false });
    await expect(recording.readGyroRecord()).resolves.toBeUndefined();
    await expect(recording.readExposureRecord()).resolves.toBeUndefined();
    expect(recording.listsExposureRecord).toBe(false);
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
      .addRecord({
        id: RecordType.Info,
        format: InfoRecordFormat.Protobuf,
        payload: new Uint8Array(),
      })
      .buildContiguous();
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));
    expect(recording.calibration).toEqual({ calibration: undefined, warnings: [] });
    expect(recording.info.model).toBeUndefined();
  });

  it('reads the calibration of an X6-shaped file, whose info record carries only the v6 string', async () => {
    const info = encodeProtobuf([
      ...minimalInfoFields({ model: 'Insta360 X6' }),
      stringField(111, v6CalibrationString()),
    ]);
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: info })
      .buildIndexed({ alignment: 4096, wrapInInstBox: true });
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));
    expect(recording.info.model).toBe('Insta360 X6');
    expect(recording.calibration.warnings).toEqual([]);
    expect(recording.calibration.calibration).toMatchObject({
      version: CalibrationVersion.ExtendedMei,
      canvas: { width: 15_488, height: 7744 },
      lenses: [{ lensIndex: 0 }, { lensIndex: 1 }],
    });
  });

  // A float-layout camera writes every capture stamp in milliseconds, as telemetry-parser reads
  // them; no such recording is at hand (verify on real file).
  it('infers a float gyro layout from the record when the info record has no flag, and reads the clock and the exposure stamps in milliseconds', async () => {
    const floatSamples = new Uint8Array(56 * 2);
    const samples = new DataView(floatSamples.buffer);
    samples.setBigUint64(0, 5000n, true);
    samples.setBigUint64(56, 5001n, true);
    const exposureEntries = new Uint8Array(16 * 2);
    const entries = new DataView(exposureEntries.buffer);
    entries.setBigUint64(0, 1999n, true);
    entries.setBigUint64(16, 2016n, true);
    const info = new Uint8Array([0xc0, 0x01, 0xd0, 0x0f]); // field 24 (first frame timestamp) = 2000
    const file = new TrailerFixtureBuilder()
      .withPrefix(minimalMp4Prefix())
      .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: info })
      .addRecord({ id: RecordType.Gyro, payload: floatSamples })
      .addRecord({ id: RecordType.Exposure, payload: exposureEntries })
      .buildContiguous();
    const recording = await readRecording(new InMemoryRandomAccessSource(file.bytes));
    const clock = await recording.captureClock();
    expect(clock?.firstFrameCaptureTime).toBe(2_000_000);
    const gyro = await recording.readGyroRecord();
    expect(gyro?.layout).toBe('float');
    const exposure = await recording.readExposureRecord();
    expect(exposure?.entryAt(1).captureTime).toBe(2_016_000);
    expect(exposure?.indexAtOrAfter(microseconds(2_000_000))).toBe(1);
  });

  it('opens with one size lookup and leaves the box headers at the start of the file alone', async () => {
    const source = new InMemoryRandomAccessSource(officeRecords().buildContiguous().bytes);
    await readRecording(source);
    expect(source.sizeCalls).toBe(1);
    expect(source.reads.filter((range) => range.offset === 0)).toEqual([]);
  });

  it('reads the gyro record once when the info record names its sample layout', async () => {
    const source = new InMemoryRandomAccessSource(officeRecords().buildContiguous().bytes);
    const recording = await readRecording(source);
    const readsBefore = source.reads.length;
    await recording.readGyroRecord();
    expect(source.reads.length - readsBefore).toBe(1);
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
    expect(recording.info).toMatchObject({
      model: 'Insta360 OneR',
      frameRate: 30,
      isRawGyro: true,
      preferredFrameTimeSource: 'exposure-record',
    });
    expect(recording.calibration.calibration?.version).toBe(CalibrationVersion.Legacy);
    expect(recording.calibration.calibration?.canvas).toEqual({ width: 6080, height: 3040 });

    const gyro = await recording.readGyroRecord();
    expect(gyro).toMatchObject({ layout: 'raw', strayBytes: 1 });
    expect(gyro?.track.length).toBe(1178);
    const track = gyro!.track;
    expect(track.sampleAt(1).captureTime - track.sampleAt(0).captureTime).toBe(1000);

    const exposure = await recording.readExposureRecord();
    expect(exposure?.length).toBe(40);
    const clock = await recording.captureClock();
    expect(exposure?.indexAtOrAfter(clock?.firstFrameCaptureTime ?? microseconds(0))).toBeLessThan(
      40,
    );
  });

  it('reads the X5 file: inst-wrapped indexed trailer without layout hints', async () => {
    const recording = await readRecording(
      new InMemoryRandomAccessSource(loadFixture('thirdparty/insta360py/x5_indexed.insv')),
    );
    expect(recording.info).toMatchObject({
      model: 'Insta360 X5',
      firmware: 'v1.11.6_build1',
      fileLayout: undefined,
    });
    expect(recording.calibration.calibration?.version).toBe(CalibrationVersion.Legacy);
    const gyro = await recording.readGyroRecord();
    expect(gyro?.track.length).toBe(12);
  });
});
