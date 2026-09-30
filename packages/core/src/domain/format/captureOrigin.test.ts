import { describe, expect, it } from 'vitest';

import { firstFrameCaptureTime } from './captureOrigin';
import type { RecordingInfo } from './info/RecordingInfo';
import { FloatGyroSampleLayout } from './records/gyro/FloatGyroSampleLayout';
import { RawGyroSampleLayout } from './records/gyro/RawGyroSampleLayout';

function infoWith(overrides: Partial<RecordingInfo>): RecordingInfo {
  return {
    serialNumber: undefined,
    model: undefined,
    firmware: undefined,
    calibration: {
      offset: undefined,
      offsetV2: undefined,
      offsetV3: undefined,
      offsetV6: undefined,
    },
    dimension: undefined,
    frameRate: undefined,
    captureMode: undefined,
    firstFrameTimestamp: undefined,
    readoutTime: undefined,
    windowCrop: undefined,
    gyroOffset: undefined,
    gyroType: undefined,
    isRawGyro: undefined,
    preferredFrameTimeSource: undefined,
    sensorRanges: undefined,
    fileLayout: undefined,
    trackOrder: undefined,
    ...overrides,
  };
}

describe('firstFrameCaptureTime', () => {
  it('reads microseconds when the gyro record uses the raw layout', () => {
    const info = infoWith({ firstFrameTimestamp: 500 });
    expect(firstFrameCaptureTime(info, new RawGyroSampleLayout())).toBe(500);
  });

  it('reads milliseconds when the gyro record uses the float layout', () => {
    const info = infoWith({ firstFrameTimestamp: 500 });
    expect(firstFrameCaptureTime(info, new FloatGyroSampleLayout())).toBe(500_000);
  });

  it('reads microseconds for a camera without a gyro layout', () => {
    expect(firstFrameCaptureTime(infoWith({ firstFrameTimestamp: 500 }), undefined)).toBe(500);
  });

  it('knows nothing when the info record does not say', () => {
    expect(firstFrameCaptureTime(infoWith({}), new RawGyroSampleLayout())).toBeUndefined();
  });
});
