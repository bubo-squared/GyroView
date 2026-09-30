import { describe, expect, it } from 'vitest';

import { colorSpaceOf } from './colorSpaceOf';

describe('colorSpaceOf', () => {
  it("names all of an HLG track's colour, as the X6's lens tracks carry it", () => {
    expect(
      colorSpaceOf({
        primaries: 'bt2020',
        transfer: 'hlg',
        matrix: 'bt2020-ncl',
        range: 'limited',
      }),
    ).toEqual({ primaries: 'bt2020', transfer: 'hlg', matrix: 'bt2020-ncl', fullRange: false });
  });

  it('leaves out what the track does not name', () => {
    expect(
      colorSpaceOf({
        primaries: 'unspecified',
        transfer: 'unspecified',
        matrix: 'unspecified',
        range: 'full',
      }),
    ).toEqual({ fullRange: true });
  });
});
