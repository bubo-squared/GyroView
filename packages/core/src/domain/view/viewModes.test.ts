import { describe, expect, it } from 'vitest';

import type { Framing } from './Framing';
import { degrees } from '../../shared/units/angle';
import { DEFAULT_VIEW_MODE, VIEW_MODES, type ViewMode } from './ViewMode';
import { motionLookRulesFor, viewModeRulesFor } from './viewModes';
import { MOTION_LOOK_VIEW } from './motionLookView';
import { DEFAULT_VIEW } from './ViewState';
import { EVERYTHING_MOVED, SQUARE, turnOf } from '../../../test/support/viewFixtures';

/**
 * The parts of the framing each mode may change; the normal view's yaw also turns the panorama.
 */
const OWN_PARTS: Readonly<Record<ViewMode, readonly (keyof Framing)[]>> = {
  normal: ['view'],
  equirectangular: ['view', 'panorama'],
  'raw-lenses': ['lenses'],
};

describe('view modes', () => {
  it('offers the raw lenses first and by default, the stitched views after', () => {
    expect(VIEW_MODES).toEqual(['raw-lenses', 'equirectangular', 'normal']);
    expect(DEFAULT_VIEW_MODE).toBe('raw-lenses');
  });

  it('stabilizes the stitched modes and leaves the raw lenses as recorded', () => {
    const stabilized = VIEW_MODES.filter((mode) => viewModeRulesFor(mode).isStabilized);
    expect(stabilized).toEqual(['equirectangular', 'normal']);
  });

  it.each(VIEW_MODES)('lets %s change only its own part of the framing', (mode) => {
    const rules = viewModeRulesFor(mode);
    const changed: Framing[] = [
      rules.pan(EVERYTHING_MOVED, { x: 40, y: -30 }, SQUARE),
      rules.turn(EVERYTHING_MOVED, turnOf(5, 5), SQUARE),
      rules.zoom(EVERYTHING_MOVED, { steps: 2, focus: { x: 0.7, y: 0.3 } }, SQUARE),
      rules.reset(EVERYTHING_MOVED),
    ];
    const others = (['view', 'panorama', 'lenses'] as const).filter(
      (part) => !OWN_PARTS[mode].includes(part),
    );
    for (const framing of changed) {
      for (const part of others) expect(framing[part]).toEqual(EVERYTHING_MOVED[part]);
    }
  });

  it('turns the panorama by the yaw alone, leaving the normal view its pitch and field of view', () => {
    const rules = viewModeRulesFor('equirectangular');
    const { pitch, fieldOfView } = EVERYTHING_MOVED.view;
    for (const framing of [
      rules.pan(EVERYTHING_MOVED, { x: 40, y: -30 }, SQUARE),
      rules.turn(EVERYTHING_MOVED, turnOf(5, 5), SQUARE),
      rules.zoom(EVERYTHING_MOVED, { steps: 2, focus: { x: 0.7, y: 0.3 } }, SQUARE),
      rules.reset(EVERYTHING_MOVED),
    ]) {
      expect(framing.view).toMatchObject({ pitch, fieldOfView });
    }
  });

  it.each(VIEW_MODES)("takes a page's view as given in %s, and leaves the rest", (mode) => {
    const placed = viewModeRulesFor(mode).place(EVERYTHING_MOVED, {
      ...DEFAULT_VIEW,
      yaw: degrees(270),
    });
    expect(placed).toEqual({ ...EVERYTHING_MOVED, view: { ...DEFAULT_VIEW, yaw: -90 } });
  });

  it('lets the device turn the normal view alone', () => {
    expect(VIEW_MODES.filter((mode) => motionLookRulesFor(mode))).toEqual(['normal']);
    expect(motionLookRulesFor('normal')).toBe(MOTION_LOOK_VIEW);
  });
});
