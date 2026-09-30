import { describe, expect, it } from 'vitest';

import { UNSPECIFIED_COLOUR } from './TrackColour';

describe('UNSPECIFIED_COLOUR', () => {
  it('says nothing of any of the four, as WebCodecs spells a value it does not know', () => {
    expect(UNSPECIFIED_COLOUR).toEqual({
      primaries: 'unspecified',
      transfer: 'unspecified',
      matrix: 'unspecified',
      range: 'unspecified',
    });
  });
});
