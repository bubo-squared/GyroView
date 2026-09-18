import { describe, expect, it } from 'vitest';

import { CaptureClock } from './CaptureClock';
import type { FrameTimingContext } from './FrameTimeSource';
import { FrameTimesResolver, PtsType } from './FrameTimesResolver';
import {
  microseconds,
  milliseconds,
  millisecondsToSeconds,
  seconds,
} from '../../../shared/units/time';
import { ExposureRecordParser } from '../exposure/ExposureRecordParser';
import { captureError } from '../../../../test/support/errors';
import { loadFixture } from '../../../../test/support/fixtures';

const resolver = new FrameTimesResolver();
const OFFICE_FIRST_FRAME = microseconds(921_751_839);
const OFFICE_READOUT = millisecondsToSeconds(milliseconds(8.4075));
const OFFICE_FPS = 60_000 / 1001;
const exposureHead = new ExposureRecordParser().parse(
  loadFixture('x5/office/record-04-exposure-first16.bin'),
);

function context(overrides: Partial<FrameTimingContext> = {}): FrameTimingContext {
  return {
    clock: new CaptureClock(OFFICE_FIRST_FRAME, milliseconds(1.6)),
    frameCount: 10,
    frameRate: OFFICE_FPS,
    readout: OFFICE_READOUT,
    exposure: exposureHead,
    trackTimestamps: undefined,
    ...overrides,
  };
}

describe('FrameTimesResolver with the office exposure record', () => {
  const resolved = resolver.resolve(context(), PtsType.ExposureRecord);

  it('uses the exposure record and skips the six pre-roll entries', () => {
    expect(resolved.source).toBe('exposure-record');
    expect(resolved.warnings).toEqual([]);
    expect(resolved.frameTimes.frameCount).toBe(10);
    expect(resolved.frameTimes.frameAt(0).captureTimestamp).toBe(OFFICE_FIRST_FRAME);
    expect(resolved.frameTimes.frameAt(0).videoTime).toBe(0);
  });

  it('carries exposure and readout into the mid-exposure sampling time', () => {
    const frame = resolved.frameTimes.frameAt(1);
    expect(frame.exposure).toBeCloseTo(1 / 640, 8);
    expect(frame.videoTime).toBeCloseTo(1 / OFFICE_FPS, 4);
    expect(frame.midExposureVideoTime).toBeCloseTo(
      frame.videoTime + 1 / 1280 + OFFICE_READOUT / 2,
      9,
    );
  });

  it('finds the frame shown at a video time', () => {
    const { frameTimes } = resolved;
    expect(frameTimes.frameIndexAt(seconds(0))).toBe(0);
    const justAfterFrame3 = seconds(frameTimes.frameAt(3).videoTime + 0.001);
    expect(frameTimes.frameIndexAt(justAfterFrame3)).toBe(3);
    expect(frameTimes.frameIndexAt(seconds(-1))).toBe(0);
    expect(frameTimes.frameIndexAt(seconds(100))).toBe(9);
  });
});

describe('FrameTimesResolver fallbacks', () => {
  it('falls back to track timestamps when the exposure record is too short', () => {
    const resolved = resolver.resolve(
      context({ frameCount: 3, exposure: undefined, trackTimestamps: [0, 0.5, 1] }),
      PtsType.ExposureRecord,
    );
    expect(resolved.source).toBe('track-timestamps');
    expect(resolved.warnings).toEqual(['exposure-record unavailable']);
    expect(resolved.frameTimes.frameAt(2).videoTime).toBe(1);
    expect(resolved.frameTimes.frameAt(2).exposure).toBe(0);
  });

  it('prefers track timestamps when the camera says so', () => {
    const resolved = resolver.resolve(
      context({ frameCount: 2, trackTimestamps: [0, 0.25] }),
      PtsType.TrackTimestamps,
    );
    expect(resolved.source).toBe('track-timestamps');
  });

  it('spaces frames nominally when nothing else exists', () => {
    const resolved = resolver.resolve(context({ frameCount: 4, exposure: undefined }), undefined);
    expect(resolved.source).toBe('nominal');
    expect(resolved.warnings).toEqual([
      'exposure-record unavailable',
      'track-timestamps unavailable',
    ]);
    expect(resolved.frameTimes.frameAt(3).videoTime).toBeCloseTo(3 / OFFICE_FPS, 9);
  });

  it('declines an exposure record with fewer entries than frames', () => {
    const resolved = resolver.resolve(context({ frameCount: 11 }), PtsType.ExposureRecord);
    expect(resolved.source).toBe('nominal');
  });

  it('fails with a typed error when no source works', () => {
    expect(
      captureError(() =>
        resolver.resolve(context({ exposure: undefined, frameRate: undefined }), undefined),
      ),
    ).toMatchObject({ code: 'no-frame-times' });
  });
});
