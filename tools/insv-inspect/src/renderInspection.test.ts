import { describe, expect, it } from 'vitest';

import type { Inspection } from './Inspection';
import { renderInspection } from './renderInspection';

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
    rollingShutterTimeMs: 8.4075,
    fileGroup: undefined,
    windowCrop: undefined,
    gyroTimestampMs: 1.6,
    totalFrames: undefined,
    gyroType: 1,
    isRawGyro: true,
    ptsType: 2,
    sensorRanges: { accelerometerG: 32, gyroscopeDps: 2000 },
    fileLayout: 2,
    trackOrder: 1,
  },
  calibration: {
    version: 3,
    canvas: [10_752, 5376],
    lenses: [
      {
        index: 0,
        model: 'mei',
        principalPoint: [2689.89, 2681.94],
        orientationDegrees: [-0.002, 0.377, 90.524],
        translationMetres: [0, 0, 0],
      },
    ],
    warnings: ['offset_v2 skipped: example'],
  },
  gyro: {
    samples: 261_872,
    firstTimestampUs: 921_648_752,
    lastTimestampUs: 1_183_880_765,
    meanIntervalUs: 1001.3,
    meanAccelerationMagnitudeG: 0.998,
  },
  exposure: {
    entries: 15_720,
    firstTimestampUs: 921_651_739,
    lastTimestampUs: 1_183_876_117,
    meanExposureSeconds: 1 / 640,
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
      'Gyro: 261,872 samples over 262.232 s, mean interval 1001.300 us, mean |a| 0.998 g',
    );
    expect(report).toContain('mean shutter 1/640 s, first encoded frame at entry 6');
  });

  it('says so when gyro or exposure are missing', () => {
    const bare = renderInspection({ ...inspection, gyro: undefined, exposure: undefined });
    expect(bare).toContain('Gyro: none');
    expect(bare).toContain('Exposure: none');
  });
});
