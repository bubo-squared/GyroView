import { LENS_TILES_VIEW } from './lensTilesView';
import { NORMAL_VIEW } from './normalView';
import { PANORAMA_VIEW } from './panoramaView';
import type { ViewMode, ViewModeRules } from './ViewMode';

const RULES: Readonly<Record<ViewMode, ViewModeRules>> = {
  normal: NORMAL_VIEW,
  equirectangular: PANORAMA_VIEW,
  'raw-lenses': LENS_TILES_VIEW,
};

export function viewModeRulesFor(mode: ViewMode): ViewModeRules {
  return RULES[mode];
}
