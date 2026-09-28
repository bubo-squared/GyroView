import { degrees, GyroViewError, type ViewState } from '@gyroview/core';

import type { ViewAngles } from './PlayerOptions';

/**
 * A number from the page, or from another origin through the embed: NaN from an empty field, an
 * undefined value or text would reach the clock and the view, which cannot take it.
 */
export function ensureFinite(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GyroViewError('invalid-argument', `${name} must be a finite number`);
  }
}

/**
 * A view from the page, each angle checked and read as degrees.
 */
export function viewStateOf(view: ViewAngles): ViewState {
  ensureFinite(view.yaw, 'yaw');
  ensureFinite(view.pitch, 'pitch');
  ensureFinite(view.fieldOfView, 'fieldOfView');
  return {
    yaw: degrees(view.yaw),
    pitch: degrees(view.pitch),
    fieldOfView: degrees(view.fieldOfView),
  };
}
