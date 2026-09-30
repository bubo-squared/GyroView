import { describe, expect, it } from 'vitest';

import { parseInfoRecord } from './parseInfoRecord';
import { FileLayoutValue, TrackOrderValue } from './infoFields';
import { InfoRecordFormat } from '../constants';
import { CALIBRATION_SOURCES } from './calibrationSources';
import { mapRecord } from '../../../shared/mapRecord';
import { minimalInfoFields, minimalInfoRecord } from '../../../testing/minimalInfoRecord';
import { encodeProtobuf, stringField } from '../../../testing/protobufWriter';
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
  it('reads each string from the field its calibration source names', () => {
    const texts = mapRecord(CALIBRATION_SOURCES, (source) => `string of field ${source.field}`);
    const record = encodeProtobuf([
      ...minimalInfoFields({ model: 'Insta360 X4' }),
      ...Object.values(CALIBRATION_SOURCES).map((source) =>
        stringField(source.field, `string of field ${source.field}`),
      ),
    ]);
    expect(parseInfoRecord(record, InfoRecordFormat.Protobuf).calibration).toEqual(texts);
  });
});
