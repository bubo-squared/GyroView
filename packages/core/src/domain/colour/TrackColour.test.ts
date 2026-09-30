import { describe, expect, it } from 'vitest';

import { MATRIX_COEFFICIENTS, namedOrUnspecified } from './TrackColour';

describe('namedOrUnspecified', () => {
  it('names a value the core knows as it is', () => {
    expect(namedOrUnspecified(MATRIX_COEFFICIENTS, 'bt2020-ncl')).toBe('bt2020-ncl');
  });

  it('takes any other value, or none, for unspecified', () => {
    for (const value of ['ycgco', null, undefined]) {
      expect(namedOrUnspecified(MATRIX_COEFFICIENTS, value)).toBe('unspecified');
    }
  });
});
