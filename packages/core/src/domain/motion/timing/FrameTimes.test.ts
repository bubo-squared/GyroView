import { describe, expect, it } from 'vitest';

import { CaptureClock } from './CaptureClock';
import { FrameTimes } from './FrameTimes';
import { microseconds, seconds, type Seconds } from '../../../shared/units/time';

const FIRST_FRAME_CAPTURE = 1_000_000;
const CLOCK = new CaptureClock(microseconds(FIRST_FRAME_CAPTURE));
/**
 * The X5's 5.7K frame spacing on the track: 60000/1001 fps.
 */
const NTSC_60 = seconds(1001 / 60_000);

function capturedEvery(
  intervalMicroseconds: number,
  frameCount: number,
  frameDuration: Seconds | undefined,
): FrameTimes {
  const captureTimes = Float64Array.from(
    { length: frameCount },
    (_unused, index) => FIRST_FRAME_CAPTURE + index * intervalMicroseconds,
  );
  return FrameTimes.withoutShutterTimes({
    clock: CLOCK,
    captureTimes,
    readoutTime: undefined,
    frameDuration,
  });
}

describe('FrameTimes', () => {
  it('finds a presented frame by its place in the track, though the camera clock drifts from it', () => {
    // The office recording's capture clock runs about 1.3 µs a frame ahead of the track.
    const frames = capturedEvery(16_682.1, 15_710, NTSC_60);
    expect(frames.frameIndexAt(seconds(15_698 * NTSC_60))).toBe(15_698);
  });

  it('finds a frame whose timestamp the decoder rounded down to the microsecond', () => {
    const frames = capturedEvery(16_683.3, 10, NTSC_60);
    expect(frames.frameIndexAt(seconds(0.033366))).toBe(2);
  });

  it('shows a frame until the next is due, clamped to the first and the last', () => {
    const frames = capturedEvery(16_683.3, 10, NTSC_60);
    expect(frames.frameIndexAt(seconds(2.5 * NTSC_60))).toBe(2);
    expect(frames.frameIndexAt(seconds(-1))).toBe(0);
    expect(frames.frameIndexAt(seconds(60))).toBe(9);
  });

  it('finds the last frame captured by then when the track gives no frame spacing', () => {
    const frames = capturedEvery(100_000, 10, undefined);
    expect(frames.frameIndexAt(seconds(0.25))).toBe(2);
  });
});
