import { describe, expect, it } from 'vitest';

import { repairedTimeline } from './repairedTimeline';

/**
 * A kilohertz timeline in microseconds, with the given stamps moved by `offset`.
 */
function timeline(count: number, strays: readonly number[] = [], offset = 0): Float64Array {
  return Float64Array.from(
    { length: count },
    (_unused, index) => index * 1000 + (strays.includes(index) ? offset : 0),
  );
}

describe('repairedTimeline', () => {
  it('leaves a clean timeline and a real gap as they are', () => {
    const withGap = Float64Array.from([0, 1000, 2000, 3000, 2_003_000, 2_004_000, 2_005_000]);
    expect(repairedTimeline(timeline(10))).toEqual(timeline(10));
    expect(repairedTimeline(withGap)).toEqual(withGap);
  });

  it.each([
    ['the first', [0]],
    ['a middle', [50]],
    ['the last', [99]],
    ['a pair of middle', [50, 51]],
  ])('mends %s stamp moved far forward or back', (_where, strays) => {
    for (const offset of [5e6, -5e6, 2 ** 40]) {
      const repaired = repairedTimeline(timeline(100, strays, offset));
      for (const [index, time] of repaired.entries()) {
        expect(time).toBe(index * 1000);
      }
    }
  });

  it('never lets a stamp go back', () => {
    const repaired = repairedTimeline(timeline(100, [40, 41, 42], -5e6));
    for (let index = 1; index < repaired.length; index += 1) {
      expect(repaired[index]).toBeGreaterThanOrEqual(repaired[index - 1] ?? 0);
    }
  });
});
