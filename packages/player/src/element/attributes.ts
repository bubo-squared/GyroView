import { clampView, degrees, type ViewState } from '@gyroview/core';

import { SourceAttribute, ViewAttribute } from './attributeNames';
import { qualityOf } from '../choices';
import { DEFAULT_QUALITY, QUALITIES, type MediaInput, type PlayerSource } from '../PlayerSource';

/**
 * Reads one attribute of the element, `null` when absent, like `Element.getAttribute`.
 */
export type AttributeReader = (name: string) => string | null;

const PROXY_AUTO = 'auto';
const PROXY_NONE = 'none';

export interface ParsedSource {
  readonly source: PlayerSource | undefined;
  /**
   * Attribute values that were ignored, worded for a `warning` event.
   */
  readonly problems: readonly string[];
}

/**
 * The source the attributes describe, or nothing when `src` is absent. URLs resolve against
 * the document, as an image's would.
 */
export function sourceFromAttributes(read: AttributeReader, baseUrl: string): ParsedSource {
  const main = read(SourceAttribute.Src);
  if (main === null || main.trim() === '') return { source: undefined, problems: [] };
  const qualityValue = read(SourceAttribute.Quality);
  const quality = qualityOf(qualityValue);
  const problems = quality === undefined ? problemsWith('quality', qualityValue, QUALITIES) : [];
  const second = read(SourceAttribute.Src2);
  const proxy = proxyFromAttribute(read(SourceAttribute.Proxy), baseUrl);
  const source: PlayerSource = {
    main: urlInput(main, baseUrl),
    second: second === null || second.trim() === '' ? undefined : urlInput(second, baseUrl),
    proxy: proxy.input,
    shouldDiscoverProxy: proxy.shouldDiscover,
    quality: quality ?? DEFAULT_QUALITY,
  };
  return { source, problems };
}

interface ProxyChoice {
  readonly input: MediaInput | undefined;
  readonly shouldDiscover: boolean;
}

const DISCOVER_PROXY: ProxyChoice = { input: undefined, shouldDiscover: true };
const NO_PROXY: ProxyChoice = { input: undefined, shouldDiscover: false };

/**
 * `auto` (the default) looks beside the recording, `none` never does, anything else is the
 * proxy's URL.
 */
function proxyFromAttribute(value: string | null, baseUrl: string): ProxyChoice {
  const trimmed = value?.trim() ?? PROXY_AUTO;
  if (trimmed === PROXY_AUTO || trimmed === '') return DISCOVER_PROXY;
  return trimmed === PROXY_NONE
    ? NO_PROXY
    : { input: urlInput(trimmed, baseUrl), shouldDiscover: false };
}

function urlInput(value: string, baseUrl: string): MediaInput {
  return { url: new URL(value.trim(), baseUrl).href };
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

function problemsWith(
  attribute: string,
  value: string | null,
  choices: readonly string[],
): readonly string[] {
  return value === null
    ? []
    : [`ignoring ${attribute}="${value}"; expected one of ${choices.join(', ')}`];
}

const PRELOAD_NONE = 'none';

export function shouldPreload(value: string | null): boolean {
  return value?.trim().toLowerCase() !== PRELOAD_NONE;
}

const GAIN_MATCH_OFF = 'off';

export function shouldMatchGains(value: string | null): boolean {
  return value?.trim().toLowerCase() !== GAIN_MATCH_OFF;
}
