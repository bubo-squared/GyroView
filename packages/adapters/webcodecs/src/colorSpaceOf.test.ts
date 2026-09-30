import type { TrackColour } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { colorSpaceOf } from './colorSpaceOf';

const HLG: TrackColour = {
  primaries: 'bt2020',
  transfer: 'hlg',
  matrix: 'bt2020-ncl',
  range: 'limited',
};

describe('colorSpaceOf', () => {
  it("names all of an HLG track's colour, as the X6's lens tracks carry it", () => {
    expect(colorSpaceOf(HLG)).toEqual({
      primaries: 'bt2020',
      transfer: 'hlg',
      matrix: 'bt2020-ncl',
      fullRange: false,
    });
  });

  it('leaves unsaid what the track does not name, and names nothing for a track that says nothing', () => {
    const rangeOnly = {
      ...HLG,
      primaries: 'unspecified',
      transfer: 'unspecified',
      matrix: 'unspecified',
    } as const;
    expect(colorSpaceOf(rangeOnly)).toEqual({
      primaries: null,
      transfer: null,
      matrix: null,
      fullRange: false,
    });
    expect(colorSpaceOf({ ...rangeOnly, range: 'unspecified' })).toBeUndefined();
  });

  it('tells an engine that does not know a value the range alone', () => {
    const unknown = { ...HLG, transfer: 'not-a-transfer' } as unknown as TrackColour;
    expect(colorSpaceOf(unknown)).toEqual({ fullRange: false });
  });
});
