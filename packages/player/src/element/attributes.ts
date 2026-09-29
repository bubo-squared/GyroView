import {
  PlaybackAttribute,
  RequestAttribute,
  SourceAttribute,
  ViewAttribute,
} from './attributeNames';
import {
  keywordOf,
  type KeywordAttribute,
  type NullableKeywordAttribute,
} from './reflectedProperties';
import type { PlayerWarning } from '../player/PlayerEvents';
import type { ViewAngles } from '../player/PlayerOptions';
import type { PlayerSource, UrlInput } from '../PlayerSource';

/**
 * Reads one attribute of the element, `null` when absent, like `Element.getAttribute`.
 */
export type AttributeReader = (name: string) => string | null;

/**
 * How a URL is fetched, beside the URL itself.
 */
type Reading = Omit<UrlInput, 'url'>;

/**
 * The source the attributes describe, or nothing when `src` is absent. URLs resolve against
 * the document, as an image's would, and both files of a pair are read alike.
 */
export function sourceFromAttributes(
  read: AttributeReader,
  baseUrl: string,
): PlayerSource | undefined {
  const reading = readingOf(read(RequestAttribute.CrossOrigin));
  const main = urlInputOf(read(SourceAttribute.Src), baseUrl, reading);
  return main && { main, second: urlInputOf(read(SourceAttribute.Src2), baseUrl, reading) };
}

function urlInputOf(value: string | null, baseUrl: string, reading: Reading): UrlInput | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : { url: resolvedOrAsWritten(trimmed, baseUrl), ...reading };
}

/**
 * `use-credentials` sends the visitor's cookies to any origin; anything else leaves fetch's own
 * default, which sends them to the page's origin only, as `anonymous` does for a media element.
 */
function readingOf(crossOrigin: string | null): Reading {
  return keywordOf(CROSS_ORIGIN, crossOrigin) === 'use-credentials'
    ? { credentials: 'include' }
    : {};
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

const VIEW_ANGLES: Readonly<Record<string, keyof ViewAngles>> = {
  [ViewAttribute.FieldOfView]: 'fieldOfView',
  [ViewAttribute.Yaw]: 'yaw',
  [ViewAttribute.Pitch]: 'pitch',
};

/**
 * The view after one view attribute changed: the angle it names replaces the view's; an absent
 * or unreadable value leaves the view as it is. The other angles are not read again, so what the
 * viewer changed since is kept. The player clamps the view it is given.
 */
export function viewAfterAttribute(
  view: ViewAngles,
  name: string,
  value: string | null,
): ViewAngles {
  const angle = VIEW_ANGLES[name];
  const parsed = parseNumber(value);
  return angle === undefined || parsed === undefined ? view : { ...view, [angle]: parsed };
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
): PlayerWarning {
  return {
    code: 'ignored-attribute',
    message: `ignoring ${attribute}="${value}"; expected one of ${choices.join(', ')}`,
  };
}

/**
 * The `warning` for a view attribute whose value is no number of degrees; none for one that is,
 * or for an absent attribute, which leaves the view as it is.
 */
export function unreadableAngleWarning(
  attribute: string,
  value: string | null,
): PlayerWarning | undefined {
  return value === null || parseNumber(value) !== undefined
    ? undefined
    : {
        code: 'ignored-attribute',
        message: `ignoring ${attribute}="${value}"; expected a number of degrees`,
      };
}

/**
 * `none` keeps the decoders idle until play; `auto`, the default, shows the first frame at once.
 */
export const PRELOAD: KeywordAttribute<'none' | 'auto'> = {
  name: PlaybackAttribute.Preload,
  keywords: ['none', 'auto'],
  fallback: 'auto',
};

/**
 * `off` leaves the lenses' exposure as recorded; `on`, the default, matches it along the seam.
 */
export const GAIN_MATCH: KeywordAttribute<'on' | 'off'> = {
  name: PlaybackAttribute.GainMatch,
  keywords: ['on', 'off'],
  fallback: 'on',
};

/**
 * `use-credentials` fetches the recording with the visitor's cookies; `anonymous`, in effect for
 * an empty or unknown value, without them across origins. Absent, its property reads `null`, as
 * a media element's `crossOrigin` does.
 */
export const CROSS_ORIGIN: NullableKeywordAttribute<'anonymous' | 'use-credentials'> = {
  name: RequestAttribute.CrossOrigin,
  property: 'crossOrigin',
  keywords: ['anonymous', 'use-credentials'],
  fallback: 'anonymous',
};

export function shouldPreload(value: string | null): boolean {
  return keywordOf(PRELOAD, value) === 'auto';
}

export function shouldMatchGains(value: string | null): boolean {
  return keywordOf(GAIN_MATCH, value) === 'on';
}
