import { readRecording, RecordType } from '@gyroview/core';
import { InMemoryRandomAccessSource } from '@gyroview/core/testing';
import { describe, expect, it } from 'vitest';

import { readFixture } from './fixtureFiles';
import { assembleSyntheticRecording } from './syntheticRecording';

describe('assembleSyntheticRecording', () => {
  it('keeps the media boxes intact and appends an inst-wrapped trailer the core reads back', async () => {
    const media = await readFixture('synthetic/dual-track-64px-10fps-3s.mp4');
    const bytes = assembleSyntheticRecording(media, {
      info: await readFixture('x5/office/record-01-info.bin'),
      gyro: await readFixture('x5/office/record-03-gyro-first2000.bin'),
      exposure: await readFixture('x5/office/record-04-exposure-first16.bin'),
    });

    expect(bytes.subarray(0, media.byteLength)).toEqual(media);
    const recording = await readRecording(new InMemoryRandomAccessSource(bytes));
    expect(recording.boxes.map((box) => box.type)).toEqual([
      'ftyp',
      'moov',
      'free',
      'mdat',
      'inst',
    ]);
    expect(recording.trailerWrapper).toBe('inst-box');
    expect(recording.info.model).toBe('Insta360 X5');
    expect(recording.recordSummaries().map((record) => record.id)).toEqual([
      RecordType.Info,
      RecordType.Gyro,
      RecordType.Exposure,
    ]);
    const gyro = await recording.readGyroRecord();
    const exposure = await recording.readExposureRecord();
    expect(gyro?.track.length).toBe(2000);
    expect(exposure?.length).toBe(16);
  });
});
