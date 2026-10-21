import { describe, expect, it } from 'vitest';

import { RenditionSpan, renditionSizeOf } from './RenditionSpan';
import { seconds } from '../../shared/units/time';

const DURATION = seconds(10);
/**
 * Half a millisecond, the pipeline's tolerance between the frames of a pair.
 */
const TOLERANCE = seconds(0.0005);

describe('RenditionSpan', () => {
  it('spans the whole recording when no bounds are given', () => {
    const span = RenditionSpan.of({}, DURATION);
    expect({ from: span.from, to: span.to }).toEqual({ from: 0, to: 10 });
  });

  it('keeps bounds within the recording, and ends one asked past the end at the end', () => {
    expect(RenditionSpan.of({ from: seconds(2), to: seconds(4) }, DURATION)).toMatchObject({
      from: 2,
      to: 4,
    });
    expect(RenditionSpan.of({ from: seconds(2), to: seconds(60) }, DURATION).to).toBe(10);
  });

  it('refuses a span that is empty, reversed, starts before zero or after the end, or is no number', () => {
    for (const request of [
      { from: seconds(4), to: seconds(4) },
      { from: seconds(5), to: seconds(4) },
      { from: seconds(-1) },
      { from: seconds(10) },
      { from: seconds(NaN) },
      { to: seconds(Infinity), from: seconds(NaN) },
    ]) {
      expect(() => RenditionSpan.of(request, DURATION)).toThrow(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    }
  });

  it('takes the frames from its start up to, not including, its end', () => {
    const span = RenditionSpan.of({ from: seconds(2), to: seconds(4) }, DURATION);
    expect(span.includes(seconds(1.9), TOLERANCE)).toBe(false);
    expect(span.includes(seconds(2), TOLERANCE)).toBe(true);
    expect(span.includes(seconds(1.9998), TOLERANCE)).toBe(true);
    expect(span.includes(seconds(3.99), TOLERANCE)).toBe(true);
    expect(span.includes(seconds(4), TOLERANCE)).toBe(false);
    expect(span.hasEndedAt(seconds(3.99), TOLERANCE)).toBe(false);
    expect(span.hasEndedAt(seconds(3.9998), TOLERANCE)).toBe(true);
  });

  it('times its frames in whole microseconds from its start', () => {
    const span = RenditionSpan.of({ from: seconds(2) }, DURATION);
    expect(span.timestampOf(seconds(2))).toBe(0);
    expect(span.timestampOf(seconds(2.0333333))).toBe(33_333);
    expect(span.timestampOf(seconds(1.9999999))).toBe(0);
    expect(span.duration).toBe(8);
  });
});

describe('renditionSizeOf', () => {
  it('makes a 2:1 equirectangular picture of the width asked for', () => {
    expect(renditionSizeOf(3840)).toEqual({ width: 3840, height: 1920 });
    expect(renditionSizeOf(4)).toEqual({ width: 4, height: 2 });
  });

  it('refuses a width whose picture would have an odd side, or that is no whole positive number', () => {
    for (const width of [6, 3, 2, 1, 0, -4, 3840.5, NaN]) {
      expect(() => renditionSizeOf(width)).toThrow(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    }
  });
});
