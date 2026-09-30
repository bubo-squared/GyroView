import { describe, expect, it } from 'vitest';

import { minimalInfoFields, minimalInfoRecord } from './minimalInfoRecord';
import { encodeProtobuf, stringField } from './protobufWriter';
import { InfoField } from '../domain/format/info/infoFields';
import { parseInfoRecord } from '../domain/format/info/parseInfoRecord';
import { InfoRecordFormat } from '../domain/format/constants';

const EVERY_FIELD = {
  model: 'Insta360 X3',
  firstFrameTimestamp: 123_456_789,
  ptsType: 2,
  fileLayout: 1,
  trackOrder: 2,
} as const;

describe('minimalInfoRecord', () => {
  it('encodes the bytes the hand-encoded record did', () => {
    expect([...minimalInfoRecord(EVERY_FIELD)]).toEqual([
      0x12, 0x0b, 0x49, 0x6e, 0x73, 0x74, 0x61, 0x33, 0x36, 0x30, 0x20, 0x58, 0x33, 0xc0, 0x01,
      0x95, 0x9a, 0xef, 0x3a, 0x80, 0x04, 0x02, 0xf8, 0x04, 0x01, 0x80, 0x05, 0x02,
    ]);
  });

  it('leaves out the fields not given', () => {
    const info = parseInfoRecord(
      minimalInfoRecord({ model: 'Insta360 X3' }),
      InfoRecordFormat.Protobuf,
    );
    expect(info.model).toBe('Insta360 X3');
    expect(info.firstFrameTimestamp).toBeUndefined();
    expect(info.trackOrder).toBeUndefined();
  });

  it('gives its fields to a record that needs more of them', () => {
    const record = encodeProtobuf([
      ...minimalInfoFields({ model: 'Insta360 X3' }),
      stringField(InfoField.CaptureMode, 'standard'),
    ]);
    const info = parseInfoRecord(record, InfoRecordFormat.Protobuf);
    expect(info.model).toBe('Insta360 X3');
    expect(info.captureMode).toBe('standard');
  });
});
