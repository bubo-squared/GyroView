import { describe, expect, it } from 'vitest';

import { repairedTimeline } from './repairedTimeline';

const COUNT = 100;

/**
 * A kilohertz timeline in microseconds, with the stamps at `strays` moved by `offset`.
 */
function timeline(strays: readonly number[] = [], offset = 0): Float64Array {
  return Float64Array.from(
    { length: COUNT },
    (_unused, index) => index * 1000 + (strays.includes(index) ? offset : 0),
  );
}

describe('repairedTimeline', () => {
  it('leaves a clean timeline and a real gap as they are', () => {
    const withGap = Float64Array.from(
      { length: COUNT },
      (_unused, index) => index * 1000 + (index >= 50 ? 2_000_000 : 0),
    );
    expect(repairedTimeline(timeline())).toEqual({ times: timeline(), mended: 0 });
    expect(repairedTimeline(withGap)).toEqual({ times: withGap, mended: 0 });
  });

  it.each([
    ['the first stamp', [0]],
    ['the first pair', [0, 1]],
    ['the second pair', [1, 2]],
    ['a middle stamp', [50]],
    ['a middle pair', [50, 51]],
    ['a middle run of five', [40, 41, 42, 43, 44]],
    ['the first run of three', [0, 1, 2]],
    ['a run of three after the first stamp', [1, 2, 3]],
    ['the pair before last', [97, 98]],
    ['the last pair', [98, 99]],
    ['the last stamp', [99]],
  ])('puts back %s moved far forward or back', (_where, strays) => {
    for (const offset of [5e6, -5e6, 2 ** 40]) {
      expect(repairedTimeline(timeline(strays, offset))).toEqual({
        times: timeline(),
        mended: strays.length,
      });
    }
  });

  it('keeps a stamp between strays that is only jittered', () => {
    const recorded = timeline([40, 43], 5e6).map((time, index) =>
      index === 41 ? time + 300 : time,
    );
    const { times, mended } = repairedTimeline(recorded);
    expect(mended).toBe(2);
    expect([times[40], times[41], times[42], times[43]]).toEqual([40_000, 41_300, 42_000, 43_000]);
  });

  it('puts back stamps left at zero before the clock ran', () => {
    const zeros = timeline().map((time, index) => (index < 3 ? 0 : time + 921_000_000));
    const { times, mended } = repairedTimeline(zeros);
    expect(mended).toBe(3);
    expect(times[0]).toBe(921_000_000);
  });

  it('keeps a real gap whose first stamp strays, and a stamp only jittered', () => {
    const recorded = Float64Array.from(
      { length: COUNT },
      (_unused, index) =>
        index * 1000 +
        (index >= 50 ? 2_000_000 : 0) +
        (index === 50 ? 5e6 : 0) +
        (index === 20 ? 300 : 0),
    );
    const { times, mended } = repairedTimeline(recorded);
    expect(mended).toBe(1);
    expect(times[20]).toBe(20_300);
    expect(times[50]).toBe(50_000);
    expect(times[51]).toBe(2_051_000);
  });

  it('never lets a stamp go back, though a jump back never returns', () => {
    const reset = Float64Array.from({ length: COUNT }, (_unused, index) =>
      index < 50 ? index * 1000 : index * 1000 - 5e6,
    );
    const { times } = repairedTimeline(reset);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeGreaterThanOrEqual(times[index - 1] ?? 0);
    }
  });
});
