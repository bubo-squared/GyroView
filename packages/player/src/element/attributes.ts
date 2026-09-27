import { clampView, degrees, type ViewState } from '@gyroview/core';

import { SourceAttribute, ViewAttribute } from './attributeNames';
import type { MediaInput, PlayerSource } from '../PlayerSource';

/**
 * Reads one attribute of the element, `null` when absent, like `Element.getAttribute`.
 */
export type AttributeReader = (name: string) => string | null;

/**
 * The source the attributes describe, or nothing when `src` is absent. URLs resolve against
 * the document, as an image's would.
 */
export function sourceFromAttributes(
  read: AttributeReader,
  baseUrl: string,
): PlayerSource | undefined {
  const main = urlInputOf(read(SourceAttribute.Src), baseUrl);
  return main && { main, second: urlInputOf(read(SourceAttribute.Src2), baseUrl) };
}

function urlInputOf(value: string | null, baseUrl: string): MediaInput | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : { url: resolvedOrAsWritten(trimmed, baseUrl) };
}

/**
 * The URL resolved against the document; one that does not parse goes on as written, so the
 * load fails on it and reports it as an `error`, like any source it cannot reach.
 */
function resolvedOrAsWritten(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

const VIEW_ANGLES: Readonly<Record<string, keyof ViewState>> = {
  [ViewAttribute.FieldOfView]: 'fieldOfView',
  [ViewAttribute.Yaw]: 'yaw',
  [ViewAttribute.Pitch]: 'pitch',
};

/**
 * The view after one view attribute changed: the angle it names replaces the view's; an absent
 * or unreadable value leaves the view as it is. The other angles are not read again, so what the
 * viewer changed since is kept.
 */
export function viewAfterAttribute(view: ViewState, name: string, value: string | null): ViewState {
  const angle = VIEW_ANGLES[name];
  const parsed = parseNumber(value);
  return angle === undefined || parsed === undefined
    ? view
    : clampView({ ...view, [angle]: degrees(parsed) });
}

/**
 * HTML boolean attributes are true by presence, whatever their value.
 */
export function isBooleanAttributeSet(value: string | null): boolean {
  return value !== null;
}

export function parseNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The `warning` for an attribute naming a choice the element does not know.
 */
export function ignoredChoiceWarning(
  attribute: string,
  value: string,
  choices: readonly string[],
): string {
  return `ignoring ${attribute}="${value}"; expected one of ${choices.join(', ')}`;
}

/**
 * The `warning` for a view attribute whose value is no number of degrees; none for one that is,
 * or for an absent attribute, which leaves the view as it is.
 */
export function unreadableAngleWarning(
  attribute: string,
  value: string | null,
): string | undefined {
  return value === null || parseNumber(value) !== undefined
    ? undefined
    : `ignoring ${attribute}="${value}"; expected a number of degrees`;
}

const PRELOAD_NONE = 'none';

export function shouldPreload(value: string | null): boolean {
  return value?.trim().toLowerCase() !== PRELOAD_NONE;
}

const GAIN_MATCH_OFF = 'off';

export function shouldMatchGains(value: string | null): boolean {
  return value?.trim().toLowerCase() !== GAIN_MATCH_OFF;
}
