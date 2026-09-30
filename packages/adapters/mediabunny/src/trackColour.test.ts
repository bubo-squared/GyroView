import { describe, expect, it } from 'vitest';

import { trackColourOf } from './trackColour';

describe('trackColourOf', () => {
  it('passes the values the core names through', () => {
    expect(
      trackColourOf({ primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: true }),
    ).toEqual({ primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', range: 'full' });
  });

  it('takes a value the core does not name, or none, for unspecified', () => {
    const unknown = {
      primaries: 'film',
      transfer: 'log',
      matrix: 'ycgco',
      fullRange: null,
    } as unknown as VideoColorSpaceInit;
    const unspecified = {
      primaries: 'unspecified',
      transfer: 'unspecified',
      matrix: 'unspecified',
      range: 'unspecified',
    };
    expect(trackColourOf(unknown)).toEqual(unspecified);
    expect(trackColourOf({})).toEqual(unspecified);
    expect(trackColourOf(undefined)).toEqual(unspecified);
  });

  it('tells a limited range from a range left unsaid', () => {
    expect(trackColourOf({ fullRange: false }).range).toBe('limited');
  });
});
