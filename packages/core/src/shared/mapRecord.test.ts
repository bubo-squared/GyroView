import { describe, expect, it } from 'vitest';

import { mapRecord } from './mapRecord';

describe('mapRecord', () => {
  it('turns every value under its own key', () => {
    expect(mapRecord({ short: 'ab', long: 'abcd' }, (text) => text.length)).toEqual({
      short: 2,
      long: 4,
    });
  });

  it('hands each value its key', () => {
    expect(mapRecord({ left: 1, right: 2 }, (value, key) => `${key}=${value}`)).toEqual({
      left: 'left=1',
      right: 'right=2',
    });
  });

  it('keeps the table order of the keys', () => {
    const mapped = mapRecord({ third: 3, first: 1, second: 2 }, (value) => value * 2);
    expect(Object.keys(mapped)).toEqual(['third', 'first', 'second']);
  });
});
