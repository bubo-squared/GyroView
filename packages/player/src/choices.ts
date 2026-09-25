import {
  STABILIZATION_MODES,
  VIEW_MODES,
  type StabilizationMode,
  type ViewMode,
} from '@gyroview/core';

import { QUALITIES, type Quality } from './PlayerSource';

/**
 * The choice `value` names, matched without regard to case or surrounding space; undefined when
 * absent or unknown. Attributes, menus and property setters read their choices through it.
 */
export function choiceOf<Choice extends string>(
  value: string | null,
  choices: readonly Choice[],
): Choice | undefined {
  if (value === null) return undefined;
  const wanted = value.trim().toLowerCase();
  return choices.find((choice) => choice === wanted);
}

export function stabilizationModeOf(value: string | null): StabilizationMode | undefined {
  return choiceOf(value, STABILIZATION_MODES);
}

export function viewModeOf(value: string | null): ViewMode | undefined {
  return choiceOf(value, VIEW_MODES);
}

export function qualityOf(value: string | null): Quality | undefined {
  return choiceOf(value, QUALITIES);
}
