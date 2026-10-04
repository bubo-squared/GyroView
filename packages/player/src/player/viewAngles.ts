import type { ViewState } from '@gyroview/core';

import type { ViewAngles } from './PlayerOptions';

/**
 * The view as a page sees it: a fresh object of the three angles, the roll the device gives the
 * held view kept inside the player (ADR 0040).
 */
export function anglesOf(view: ViewState): ViewAngles {
  return { yaw: view.yaw, pitch: view.pitch, fieldOfView: view.fieldOfView };
}

export function isSameAngles(a: ViewState, b: ViewState): boolean {
  return a.yaw === b.yaw && a.pitch === b.pitch && a.fieldOfView === b.fieldOfView;
}
