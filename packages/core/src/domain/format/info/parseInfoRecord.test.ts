import { describe, expect, it } from 'vitest';

import { parseInfoRecord } from './parseInfoRecord';
import { FileLayoutValue, InfoField, TrackOrderValue } from './infoFields';
import { InfoRecordFormat } from '../constants';
import { minimalInfoFields, minimalInfoRecord } from '../../../testing/minimalInfoRecord';
import {
  doubleField,
  encodeProtobuf,
  stringField,
  varintField,
} from '../../../testing/protobufWriter';
import { captureError } from '../../../../test/support/errors';
import { loadFixture } from '../../../../test/support/fixtures';
import { OFFICE_CALIBRATION } from '../../../../test/support/officeCalibration';

describe('parseInfoRecord on the office X5 recording (5.7K60)', () => {
  const info = parseInfoRecord(
    loadFixture('x5/office/record-01-info.bin'),
    InfoRecordFormat.Protobuf,
  );

  it('reads the camera identity', () => {
    expect(info).toMatchObject({
      serialNumber: 'IAHEAOFFICEXXX',
      model: 'Insta360 X5',
      firmware: 'v1.7.43_build1',
      captureMode: 'standard',
    });
  });

  it('reads every calibration string', () => {
    expect(info.calibration).toEqual(OFFICE_CALIBRATION);
  });

  it('reads the video geometry and timing', () => {
    expect(info.dimension).toEqual({ width: 2880, height: 2880 });
    expect(info.frameRate).toBe(60);
    expect(info.firstFrameTimestamp).toBe(921_751_839);
    expect(info.readoutTime).toBeCloseTo(0.0084075, 6);
    expect(info.gyroOffset).toBe(1.6);
    expect(info.preferredFrameTimeSource).toBe('exposure-record');
  });

  it('reads the gyro configuration', () => {
    expect(info.gyroType).toBe(1);
    expect(info.isRawGyro).toBe(true);
    expect(info.sensorRanges).toEqual({ accelerometerG: 32, gyroscopeDps: 2000 });
  });

  it('reads layout hints and crop information', () => {
    expect(info.fileLayout).toBe('multi-track');
    expect(info.trackOrder).toBe('stream-10-first');
    expect(info.windowCrop).toEqual({
      sensorWidth: 5376,
      sensorHeight: 5376,
      cropWidth: 5312,
      cropHeight: 5312,
      cropOffsetX: 0,
      cropOffsetY: 0,
    });
  });
});

describe('parseInfoRecord on the sailing X5 recording (8K30)', () => {
  const info = parseInfoRecord(
    loadFixture('x5/sailing/record-01-info.bin'),
    InfoRecordFormat.Protobuf,
  );

  it('reads identity, geometry and timing', () => {
    expect(info).toMatchObject({
      serialNumber: 'IAHEASAILINGXX',
      model: 'Insta360 X5',
      firmware: 'v1.11.6_build1',
      dimension: { width: 3840, height: 3840 },
      frameRate: 30,
      firstFrameTimestamp: 393_534_973,
      gyroOffset: 1.6,
      gyroType: 1,
    });
    expect(info.calibration.offsetV3).toMatch(
      /^2_2\.000000_4268\.760_4269\.610_2694\.820_2684\.700_/,
    );
  });
});

describe('parseInfoRecord edge cases', () => {
  it('returns a fully undefined info for an empty record instead of failing', () => {
    const info = parseInfoRecord(new Uint8Array(), InfoRecordFormat.Protobuf);
    expect(info.model).toBeUndefined();
    expect(Object.values(info.calibration).every((text) => text === undefined)).toBe(true);
    expect(info.dimension).toBeUndefined();
  });

  it('leaves out a field it only reports when it does not decode as its type, and opens the recording', () => {
    const fields = [
      ...minimalInfoFields({ model: 'Insta360 X3' }),
      varintField(InfoField.Dimension, 7),
      stringField(InfoField.WindowCropInfo, '\u{7}'),
      varintField(InfoField.CaptureMode, 3),
      stringField(InfoField.FrameRate, 'thirty'),
    ];
    const info = parseInfoRecord(encodeProtobuf(fields), InfoRecordFormat.Protobuf);
    expect(info).toMatchObject({
      model: 'Insta360 X3',
      dimension: undefined,
      windowCrop: undefined,
      captureMode: undefined,
      frameRate: undefined,
    });
  });

  it('refuses a field it plays by when it does not decode as its type', () => {
    const fields = [varintField(InfoField.Model, 5)];
    expect(
      captureError(() => parseInfoRecord(encodeProtobuf(fields), InfoRecordFormat.Protobuf)),
    ).toMatchObject({ code: 'invalid-protobuf' });
  });

  it('rejects the JSON encoding with a typed error naming the format', () => {
    expect(
      captureError(() => parseInfoRecord(new Uint8Array(), InfoRecordFormat.Json)),
    ).toMatchObject({
      code: 'unsupported-info-format',
      message: expect.stringContaining('format 2') as string,
    });
  });
});

function hintsOf(fileLayout: number, trackOrder: number): unknown {
  const info = parseInfoRecord(
    minimalInfoRecord({ model: 'Insta360 X4', fileLayout, trackOrder }),
    InfoRecordFormat.Protobuf,
  );
  return [info.fileLayout, info.trackOrder];
}

describe('parseInfoRecord layout hints', () => {
  it('names the values insta360-rs documents', () => {
    expect(hintsOf(FileLayoutValue.SplitFiles, TrackOrderValue.Stream00First)).toEqual([
      'split-files',
      'stream-00-first',
    ]);
  });

  it('ignores values never observed', () => {
    expect(hintsOf(7, 9)).toEqual([undefined, undefined]);
  });
});

describe('parseInfoRecord calibration strings', () => {
  it('reads each string from its field: 5, 53, 54 and 111', () => {
    const record = encodeProtobuf([
      ...minimalInfoFields({ model: 'Insta360 X4' }),
      stringField(5, 'the legacy string'),
      stringField(53, 'the v2 string'),
      stringField(54, 'the v3 string'),
      stringField(111, 'the v6 string'),
    ]);
    expect(parseInfoRecord(record, InfoRecordFormat.Protobuf).calibration).toEqual({
      offset: 'the legacy string',
      offsetV2: 'the v2 string',
      offsetV3: 'the v3 string',
      offsetV6: 'the v6 string',
    });
  });
});

const GYRO_OFFSET_MS = 2.5;

/**
 * The gyro offset read from a record holding field 28 and the field-29 fields given.
 */
function offsetWith(fieldsBesides: readonly ReturnType<typeof varintField>[]): unknown {
  const record = encodeProtobuf([
    ...minimalInfoFields({ model: 'Insta360 X4' }),
    doubleField(28, GYRO_OFFSET_MS),
    ...fieldsBesides,
  ]);
  return parseInfoRecord(record, InfoRecordFormat.Protobuf).gyroOffset;
}

describe('parseInfoRecord gyro offset', () => {
  it('reads field 28 as the gyro offset where field 29 says the camera measured one', () => {
    expect(offsetWith([varintField(29, 1)])).toBe(GYRO_OFFSET_MS);
  });

  it('takes no offset where field 29 is unset or says none', () => {
    expect(offsetWith([])).toBeUndefined();
    expect(offsetWith([varintField(29, 0)])).toBeUndefined();
  });
});
