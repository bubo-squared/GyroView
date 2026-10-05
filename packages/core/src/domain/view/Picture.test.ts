import { describe, expect, it } from 'vitest';

import { shownAreaOf, type Picture } from './Picture';
import { IDENTITY_MATRIX3 } from '../../shared/math/Matrix3';
import { degrees } from '../../shared/units/angle';

const LETTERBOXED = { x: 0, y: 0.25, width: 1, height: 0.5 };

describe('pictures', () => {
  it('show a rectilinear picture over its area', () => {
    const picture: Picture = {
      kind: 'rectilinear',
      rotation: IDENTITY_MATRIX3,
      fieldOfView: degrees(90),
      area: { x: 0, y: 0, width: 1, height: 1 },
    };
    expect(shownAreaOf(picture)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('show a letterboxed panorama over its area, the bars left out', () => {
    const picture: Picture = {
      kind: 'equirectangular',
      rotation: IDENTITY_MATRIX3,
      area: LETTERBOXED,
    };
    expect(shownAreaOf(picture)).toEqual(LETTERBOXED);
  });

  it('show a magnified panorama over the viewport only, where it reaches past its edges', () => {
    const area = { x: -0.5, y: -0.25, width: 2, height: 1.5 };
    const picture: Picture = { kind: 'equirectangular', rotation: IDENTITY_MATRIX3, area };
    expect(shownAreaOf(picture)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('show the lens tiles over the rectangle they fill together', () => {
    const tiles = [
      { x: 0.1, y: 0.25, width: 0.4, height: 0.5 },
      { x: 0.5, y: 0.25, width: 0.4, height: 0.5 },
    ];
    expect(shownAreaOf({ kind: 'lens-tiles', tiles })).toEqual({
      x: 0.1,
      y: 0.25,
      width: 0.8,
      height: 0.5,
    });
  });

  it('show a picture wholly off the viewport over nothing', () => {
    const area = { x: 1.5, y: 0, width: 1, height: 1 };
    const picture: Picture = { kind: 'equirectangular', rotation: IDENTITY_MATRIX3, area };
    expect(shownAreaOf(picture)).toEqual({ x: 1, y: 0, width: 0, height: 1 });
  });
});
