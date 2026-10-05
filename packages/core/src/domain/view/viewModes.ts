import { LENS_TILES_VIEW } from './lensTilesView';
import { MOTION_LOOK_VIEW } from './motionLookView';
import { NORMAL_VIEW } from './normalView';
import { PANORAMA_VIEW } from './panoramaView';
import type { ViewGestureRules, ViewMode, ViewModeRules } from './ViewMode';

const RULES: Readonly<Record<ViewMode, ViewModeRules>> = {
  normal: NORMAL_VIEW,
  equirectangular: PANORAMA_VIEW,
  'raw-lenses': LENS_TILES_VIEW,
};

export function viewModeRulesFor(mode: ViewMode): ViewModeRules {
  return RULES[mode];
}

/**
 * Motion look turns the normal view alone: the flat pictures show the whole sphere or the raw
 * lenses, which a phone held up as a window has nothing to turn.
 */
const MOTION_LOOK_RULES: Readonly<Record<ViewMode, ViewGestureRules | undefined>> = {
  normal: MOTION_LOOK_VIEW,
  equirectangular: undefined,
  'raw-lenses': undefined,
};

/**
 * How a mode answers gestures while the device holds the view, or nothing for a mode the device
 * does not turn.
 */
export function motionLookRulesFor(mode: ViewMode): ViewGestureRules | undefined {
  return MOTION_LOOK_RULES[mode];
}
