import { describe, expect, it } from 'vitest';

import { GainMatcher, gainsMatching } from './gainMatch';
import { seconds } from '../../shared/units/time';

describe('gainsMatching', () => {
  it('keeps the first lens at unit gain and scales the others onto it per channel', () => {
    expect(
      gainsMatching(
        [
          [0.8, 0.6, 0.4],
          [0.4, 0.6, 0.8],
        ],
        2,
      ),
    ).toEqual([
      [1, 1, 1],
      [2, 1, 0.5],
    ]);
  });

  it('clamps to the largest factor and its inverse', () => {
    expect(
      gainsMatching(
        [
          [0.9, 0.9, 0.9],
          [0.1, 0.3, 0.9],
        ],
        2,
      ),
    ).toEqual([
      [1, 1, 1],
      [2, 2, 1],
    ]);
    expect(
      gainsMatching(
        [
          [0.1, 0.1, 0.1],
          [0.9, 0.9, 0.9],
        ],
        2,
      )[1],
    ).toEqual([0.5, 0.5, 0.5]);
  });

  it('leaves a channel alone when either side is too dark to tell exposure from content', () => {
    expect(
      gainsMatching(
        [
          [0.5, 0.005, 0.5],
          [0.25, 0.25, 0.005],
        ],
        2,
      )[1],
    ).toEqual([2, 1, 1]);
  });

  it('has nothing to say without lenses', () => {
    expect(gainsMatching([], 2)).toEqual([]);
  });
});

describe('GainMatcher', () => {
  const bright = [0.8, 0.8, 0.8] as const;
  const dim = [0.4, 0.4, 0.4] as const;

  it('takes the first measurement as it is and then eases towards new ones', () => {
    const matcher = new GainMatcher({ maxGain: 2, timeConstant: seconds(1) });
    expect(matcher.gains).toBeUndefined();

    const first = matcher.update([bright, dim], seconds(0));
    expect(first[1]).toEqual([2, 2, 2]);

    const eased = matcher.update([bright, bright], seconds(1));
    const expected = 2 + (1 - 2) * (1 - Math.exp(-1));
    expect(eased[1]?.[0]).toBeCloseTo(expected, 6);
    expect(matcher.gains).toBe(eased);
  });

  it('jumps after a long gap and holds when time does not advance', () => {
    const matcher = new GainMatcher({ maxGain: 2, timeConstant: seconds(1) });
    matcher.update([bright, dim], seconds(0));
    expect(matcher.update([bright, bright], seconds(100))[1]?.[0]).toBeCloseTo(1, 6);
    expect(matcher.update([bright, dim], seconds(100))[1]?.[0]).toBeCloseTo(1, 6);
    expect(matcher.update([bright, dim], seconds(50))[1]?.[0]).toBeCloseTo(1, 6);
  });
});
