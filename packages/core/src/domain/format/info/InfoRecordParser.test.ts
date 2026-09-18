import { describe, expect, it } from 'vitest';

import { InfoRecordParser } from './InfoRecordParser';
import { loadFixture } from '../../../../test/support/fixtures';

const parser = new InfoRecordParser();

const OFFICE_OFFSET_V3 =
  '2_2.000000_4296.660_4295.450_2689.890_2681.940_-0.002_0.377_90.524_0.000000_0.000000_0.000000_0.18113680_2.16784811_-3.49636626_-0.00016818_-0.00010206_10752_5376_113_2.000000_4281.830_4282.190_8082.100_2679.470_0.289_0.043_89.987_-0.000907_-0.000055_-0.032061_0.18382449_2.06260586_-3.21479726_0.00075291_0.00063732_10752_5376_113_197632';

describe('InfoRecordParser on the office X5 recording (5.7K60)', () => {
  const info = parser.parse(loadFixture('x5/office/record-01-info.bin'));

  it('reads the camera identity', () => {
    expect(info).toMatchObject({
      serialNumber: 'IAHEAOFFICEXXX',
      model: 'Insta360 X5',
      firmware: 'v1.7.43_build1',
      captureMode: 'standard',
    });
  });

  it('reads all three calibration strings', () => {
    expect(info.calibration.offset).toBe(
      '2_2664.255_2689.890_2681.940_-0.002_0.377_90.524_2652.858_8082.100_2679.470_0.289_0.043_89.987_10752_5376_1137',
    );
    expect(info.calibration.offsetV2).toMatch(/^2_2673\.039_2689\.890_2681\.940_/);
    expect(info.calibration.offsetV3).toBe(OFFICE_OFFSET_V3);
  });

  it('reads the video geometry and timing', () => {
    expect(info.dimension).toEqual({ width: 2880, height: 2880 });
    expect(info.frameRate).toBe(60);
    expect(info.firstFrameTimestamp).toBe(921_751_839);
    expect(info.rollingShutterTimeMs).toBeCloseTo(8.4075, 3);
    expect(info.gyroTimestampMs).toBe(1.6);
    expect(info.ptsType).toBe(2);
  });

  it('reads the gyro configuration', () => {
    expect(info.gyroType).toBe(1);
    expect(info.isRawGyro).toBe(true);
    expect(info.sensorRanges).toEqual({ accelerometerG: 32, gyroscopeDps: 2000 });
  });

  it('reads layout hints and crop information', () => {
    expect(info.fileLayout).toBe(2);
    expect(info.trackOrder).toBe(1);
    expect(info.windowCrop).toEqual({
      sensorWidth: 5376,
      sensorHeight: 5376,
      cropWidth: 5312,
      cropHeight: 5312,
      cropOffsetX: 0,
      cropOffsetY: 0,
    });
    expect(info.fileGroup?.identify).toBe('/DCIM/Camera01/VID_20260814_132640_00_013.insv');
  });

  it('leaves fields the camera did not write undefined', () => {
    expect(info.totalFrames).toBeUndefined();
  });
});

describe('InfoRecordParser on the sailing X5 recording (8K30)', () => {
  const info = parser.parse(loadFixture('x5/sailing/record-01-info.bin'));

  it('reads identity, geometry and timing', () => {
    expect(info).toMatchObject({
      serialNumber: 'IAHEASAILINGXX',
      model: 'Insta360 X5',
      firmware: 'v1.11.6_build1',
      dimension: { width: 3840, height: 3840 },
      frameRate: 30,
      firstFrameTimestamp: 393_534_973,
      gyroTimestampMs: 1.6,
      gyroType: 1,
    });
    expect(info.calibration.offsetV3).toMatch(
      /^2_2\.000000_4268\.760_4269\.610_2694\.820_2684\.700_/,
    );
  });
});

describe('InfoRecordParser on an empty record', () => {
  it('returns a fully undefined info instead of failing', () => {
    const info = parser.parse(new Uint8Array());
    expect(info.model).toBeUndefined();
    expect(info.calibration).toEqual({
      offset: undefined,
      offsetV2: undefined,
      offsetV3: undefined,
    });
    expect(info.dimension).toBeUndefined();
  });
});
