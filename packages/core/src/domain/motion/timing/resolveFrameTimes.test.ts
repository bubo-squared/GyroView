import { describe, expect, it } from 'vitest';

import { CaptureClock } from './CaptureClock';
import type { FrameTimingContext } from './FrameTimeSource';
import { PtsType, resolveFrameTimes } from './resolveFrameTimes';
import {
  microseconds,
  milliseconds,
  millisecondsToSeconds,
  seconds,
} from '../../../shared/units/time';
import { parseExposureRecord } from '../../format/records/exposure/parseExposureRecord';
import { captureError } from '../../../../test/support/errors';
import { loadFixture } from '../../../../test/support/fixtures';

const OFFICE_FIRST_FRAME = microseconds(921_751_839);
const OFFICE_READOUT = millisecondsToSeconds(milliseconds(8.4075));
const OFFICE_FPS = 60_000 / 1001;
const exposureHead = parseExposureRecord(
  loadFixture('x5/office/record-04-exposure-first16.bin'),
).record;

function context(overrides: Partial<FrameTimingContext> = {}): FrameTimingContext {
  return {
    clock: new CaptureClock(OFFICE_FIRST_FRAME, milliseconds(1.6)),
    frameCount: 10,
    frameRate: OFFICE_FPS,
    readoutTime: OFFICE_READOUT,
    exposureRecord: exposureHead,
    trackTimestamps: undefined,
    ...overrides,
  };
}

describe('resolveFrameTimes with the office exposure record', () => {
  const resolved = resolveFrameTimes(context(), PtsType.ExposureRecord);

  it('uses the exposure record and skips the six pre-roll entries', () => {
    expect(resolved.source).toBe('exposure-record');
    expect(resolved.warnings).toEqual([]);
    expect(resolved.frameTimes.frameCount).toBe(10);
    expect(resolved.frameTimes.hasShutterTimes).toBe(true);
    expect(resolved.frameTimes.frameAt(0).captureTime).toBe(OFFICE_FIRST_FRAME);
    expect(resolved.frameTimes.frameAt(0).videoTime).toBe(0);
  });

  it('takes exactly the requested number of frames from the record', () => {
    const four = resolveFrameTimes(context({ frameCount: 4 }), PtsType.ExposureRecord).frameTimes;
    expect(four.frameCount).toBe(4);
    expect(four.frameAt(3).captureTime).toBe(exposureHead.entryAt(9).captureTime);
  });

  it('carries shutter and readout time into the mid-exposure sampling time', () => {
    const frame = resolved.frameTimes.frameAt(1);
    expect(frame.shutterTime).toBeCloseTo(1 / 640, 8);
    expect(frame.videoTime).toBeCloseTo(1 / OFFICE_FPS, 4);
    expect(frame.midExposureVideoTime).toBeCloseTo(
      frame.videoTime + 1 / 1280 + OFFICE_READOUT / 2,
      9,
    );
  });

  it('finds the frame shown at a video time, including exactly on a capture time', () => {
    const { frameTimes } = resolved;
    expect(frameTimes.frameIndexAt(seconds(0))).toBe(0);
    expect(frameTimes.frameIndexAt(frameTimes.frameAt(3).videoTime)).toBe(3);
    const justAfterFrame3 = seconds(frameTimes.frameAt(3).videoTime + 0.001);
    expect(frameTimes.frameIndexAt(justAfterFrame3)).toBe(3);
    expect(frameTimes.frameIndexAt(seconds(-1))).toBe(0);
    expect(frameTimes.frameIndexAt(seconds(100))).toBe(9);
  });
});

describe('resolveFrameTimes fallbacks', () => {
  it('falls back to track timestamps when the exposure record is missing', () => {
    const resolved = resolveFrameTimes(
      context({ frameCount: 3, exposureRecord: undefined, trackTimestamps: [0, 0.5, 1] }),
      PtsType.ExposureRecord,
    );
    expect(resolved.source).toBe('track-timestamps');
    expect(resolved.warnings).toEqual(['exposure-record unavailable']);
    expect(resolved.frameTimes.frameAt(2).videoTime).toBe(1);
    expect(resolved.frameTimes.frameAt(2).shutterTime).toBeUndefined();
    expect(resolved.frameTimes.hasShutterTimes).toBe(false);
  });

  it('rebases track timestamps that do not start at zero onto the first frame', () => {
    const resolved = resolveFrameTimes(
      context({ frameCount: 3, exposureRecord: undefined, trackTimestamps: [0.5, 1, 1.5] }),
      PtsType.TrackTimestamps,
    );
    expect(resolved.frameTimes.frameAt(0).videoTime).toBe(0);
    expect(resolved.frameTimes.frameAt(2).videoTime).toBe(1);
  });

  it('prefers track timestamps when the camera says so, even with an exposure record present', () => {
    const resolved = resolveFrameTimes(
      context({ frameCount: 2, trackTimestamps: [0, 0.25] }),
      PtsType.TrackTimestamps,
    );
    expect(resolved.source).toBe('track-timestamps');
  });

  it('spaces frames nominally when nothing else exists', () => {
    const resolved = resolveFrameTimes(
      context({ frameCount: 4, exposureRecord: undefined }),
      undefined,
    );
    expect(resolved.source).toBe('nominal');
    expect(resolved.warnings).toEqual([
      'exposure-record unavailable',
      'track-timestamps unavailable',
    ]);
    expect(resolved.frameTimes.frameAt(3).videoTime).toBeCloseTo(3 / OFFICE_FPS, 9);
  });

  it('declines an exposure record with fewer entries than frames', () => {
    expect(resolveFrameTimes(context({ frameCount: 11 }), PtsType.ExposureRecord).source).toBe(
      'nominal',
    );
  });

  it('declines a track timestamp list shorter than the frame count', () => {
    const resolved = resolveFrameTimes(
      context({ frameCount: 3, exposureRecord: undefined, trackTimestamps: [0] }),
      undefined,
    );
    expect(resolved.source).toBe('nominal');
  });

  it('handles a recording with no frames', () => {
    const resolved = resolveFrameTimes(
      context({ frameCount: 0, exposureRecord: undefined }),
      undefined,
    );
    expect(resolved.frameTimes.frameCount).toBe(0);
    expect(resolved.frameTimes.frameIndexAt(seconds(1))).toBeUndefined();
  });

  it('fails with a typed error when no source works', () => {
    expect(
      captureError(() =>
        resolveFrameTimes(context({ exposureRecord: undefined, frameRate: undefined }), undefined),
      ),
    ).toMatchObject({
      code: 'no-frame-times',
    });
  });
});
