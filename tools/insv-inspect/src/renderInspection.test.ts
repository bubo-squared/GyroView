import { milliseconds, seconds } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import type { GyroSummary, Inspection } from './Inspection';
import { renderInspection } from './renderInspection';

const GYRO: GyroSummary = {
  layout: 'raw',
  samples: 261_872,
  strayBytes: 1,
  damagedSamples: 0,
  mendedStamps: 0,
  spanSeconds: 262.232013,
  meanIntervalUs: 1001.3,
  meanAccelerationMagnitudeG: 0.998,
};

const inspection: Inspection = {
  file: 'sample.insv',
  fileSize: 1234,
  boxes: [
    { type: 'ftyp', offset: 0, size: 28 },
    { type: 'inst', offset: 1000, size: 234 },
  ],
  trailerWrapper: 'inst-box',
  trailerVersion: 3,
  payloadStart: 1008,
  records: [{ id: 1, format: 1, offset: 1008, size: 100 }],
  info: {
    serialNumber: 'SERIAL',
    model: 'Insta360 X5',
    firmware: 'v1.7.43_build1',
    calibration: { offset: undefined, offsetV2: undefined, offsetV3: 'x' },
    dimension: { width: 2880, height: 2880 },
    frameRate: 60,
    captureMode: 'standard',
    firstFrameTimestamp: 921_751_839,
    readoutTime: seconds(0.0084075),
    windowCrop: undefined,
    gyroOffset: milliseconds(1.6),
    gyroType: 1,
    isRawGyro: true,
    preferredFrameTimeSource: 'exposure-record',
    sensorRanges: { accelerometerG: 32, gyroscopeDps: 2000 },
    fileLayout: 'multi-track',
    trackOrder: 'stream-10-first',
  },
  calibration: {
    version: 3,
    canvas: [10_752, 5376],
    lenses: [
      {
        lensIndex: 0,
        model: 'mei',
        principalPoint: [2689.89, 2681.94],
        orientationDegrees: [-0.002, 0.377, 90.524],
        translationMetres: [0, 0, 0],
      },
    ],
  },
  calibrationWarnings: ['offset_v2 skipped: example'],
  gyro: GYRO,
  exposure: {
    entries: 15_720,
    firstCaptureTimeUs: 921_651_739,
    lastCaptureTimeUs: 1_183_876_117,
    meanShutterTimeSeconds: 1 / 640,
    firstEncodedFrameEntry: 6,
  },
};

describe('renderInspection', () => {
  const report = renderInspection(inspection);

  it('names the camera and video mode', () => {
    expect(report).toContain('Camera: Insta360 X5, firmware v1.7.43_build1, serial SERIAL');
    expect(report).toContain('Video: 2880x2880 per lens track, 60 fps, mode standard');
  });

  it('lists boxes and records with hexadecimal ids', () => {
    expect(report).toContain('  inst  offset');
    expect(report).toContain('0x01   1');
  });

  it('summarises calibration with warnings', () => {
    expect(report).toContain('Calibration: v3 on a 10752x5376 canvas');
    expect(report).toContain('lens 0: mei, centre (2689.890, 2681.940)');
    expect(report).toContain('warning: offset_v2 skipped: example');
  });

  it('summarises gyro and exposure', () => {
    expect(report).toContain(
      'Gyro: raw layout, 261,872 samples over 262.232 s, mean interval 1001.300 us, mean |a| 0.998 g, 1 stray byte(s)',
    );
    expect(report).toContain('mean shutter 1/640 s, first encoded frame at entry 6');
  });

  it('says so when no calibration is usable and still lists the warnings', () => {
    const none = renderInspection({ ...inspection, calibration: undefined });
    expect(none).toContain('Calibration: none usable');
    expect(none).toContain('warning: offset_v2 skipped: example');
  });

  it('says so when gyro or exposure are missing', () => {
    const unreadable = renderInspection({
      ...inspection,
      gyro: { unreadable: 'no layout fits' },
      exposure: { unread: 'gyro layout unknown' },
    });
    expect(unreadable).toContain('Gyro: unreadable (no layout fits)');
    expect(unreadable).toContain('Exposure: not read (gyro layout unknown)');
    const bare = renderInspection({ ...inspection, gyro: undefined, exposure: undefined });
    expect(bare).toContain('Gyro: none');
    expect(bare).toContain('Exposure: none');
  });

  it('says what damage it left out', () => {
    const gyro = { ...GYRO, damagedSamples: 3, mendedStamps: 2 };
    const damaged = renderInspection({ ...inspection, gyro, exposure: { damaged: true } });
    expect(damaged).toContain('1 stray byte(s), 3 damaged sample(s) left out, 2 stamp(s) mended');
    expect(damaged).toContain('Exposure: damaged, left out');
  });
});
