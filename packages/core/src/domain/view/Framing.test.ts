import { describe, expect, it } from 'vitest';

import { isSameFraming, withLenses, withView } from './Framing';
import { isSameMagnification } from './magnification';
import { degrees } from '../../shared/units/angle';
import { EVERYTHING_MOVED } from '../../../test/support/viewFixtures';

describe('framings', () => {
  it('tell magnifications apart by the scale and each coordinate of the centre', () => {
    const magnification = { scale: 2, centre: { x: 0.4, y: 0.6 } };
    expect(isSameMagnification(magnification, { ...magnification })).toBe(true);
    expect(isSameMagnification(magnification, { ...magnification, scale: 3 })).toBe(false);
    for (const centre of [
      { x: 0.5, y: 0.6 },
      { x: 0.4, y: 0.7 },
    ]) {
      expect(isSameMagnification(magnification, { ...magnification, centre })).toBe(false);
    }
  });

  it('tell framings apart by every part', () => {
    expect(isSameFraming(EVERYTHING_MOVED, { ...EVERYTHING_MOVED })).toBe(true);
    const turned = withView(EVERYTHING_MOVED, { ...EVERYTHING_MOVED.view, yaw: degrees(1) });
    const panorama = { ...EVERYTHING_MOVED, panorama: { ...EVERYTHING_MOVED.panorama, scale: 1 } };
    const lenses = withLenses(EVERYTHING_MOVED, { ...EVERYTHING_MOVED.lenses, scale: 1 });
    for (const changed of [turned, panorama, lenses]) {
      expect(isSameFraming(EVERYTHING_MOVED, changed)).toBe(false);
    }
  });
});
