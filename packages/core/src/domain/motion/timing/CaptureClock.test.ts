import { describe, expect, it } from 'vitest';

import { CaptureClock } from './CaptureClock';
import { microseconds, milliseconds, seconds } from '../../../shared/units/time';
import { captureError } from '../../../../test/support/errors';
import type { RecordingInfo } from '../../format/info/RecordingInfo';

const clock = new CaptureClock(microseconds(921_751_839), milliseconds(1.6));

function infoWith(overrides: Partial<RecordingInfo>): RecordingInfo {
  return {
    serialNumber: undefined,
    model: undefined,
    firmware: undefined,
    calibration: { offset: undefined, offsetV2: undefined, offsetV3: undefined },
    dimension: undefined,
    frameRate: undefined,
    captureMode: undefined,
    firstFrameTimestamp: undefined,
    readoutTimeMs: undefined,
    fileGroup: undefined,
    windowCrop: undefined,
    gyroOffsetMs: undefined,
    totalFrames: undefined,
    gyroType: undefined,
    isRawGyro: undefined,
    ptsType: undefined,
    sensorRanges: undefined,
    fileLayout: undefined,
    trackOrder: undefined,
    ...overrides,
  };
}

describe('CaptureClock', () => {
  it('maps the first frame to video time zero and later capture times to seconds', () => {
    expect(clock.videoTimeOf(microseconds(921_751_839))).toBe(0);
    expect(clock.videoTimeOf(microseconds(921_751_839 + 2_500_000))).toBe(2.5);
  });

  it('shifts gyro capture times by the gyro offset', () => {
    expect(clock.gyroVideoTimeOf(microseconds(921_751_839 + 1_000_000))).toBeCloseTo(0.9984, 9);
  });

  it('converts video time back to whole-microsecond capture times', () => {
    expect(clock.captureTimeOf(seconds(1.5))).toBe(921_751_839 + 1_500_000);
    expect(clock.captureTimeOf(seconds(0.0000004))).toBe(921_751_839);
  });

  it('defaults to no gyro offset', () => {
    expect(new CaptureClock(microseconds(1000)).gyroVideoTimeOf(microseconds(2000))).toBe(0.001);
  });

  it('builds from an info record whose timestamps are microseconds', () => {
    const built = CaptureClock.fromInfo(
      infoWith({ firstFrameTimestamp: 500, gyroOffsetMs: 2 }),
      'microseconds',
    );
    expect(built.firstFrameCaptureTime).toBe(500);
    expect(built.gyroOffset).toBe(2);
  });

  it('converts millisecond timestamps of float-layout cameras into microseconds', () => {
    const built = CaptureClock.fromInfo(infoWith({ firstFrameTimestamp: 500 }), 'milliseconds');
    expect(built.firstFrameCaptureTime).toBe(500_000);
    expect(built.gyroOffset).toBe(0);
  });

  it('fails with a typed error when the info record has no first frame timestamp', () => {
    expect(captureError(() => CaptureClock.fromInfo(infoWith({}), 'microseconds'))).toMatchObject({
      code: 'no-frame-times',
    });
  });
});
