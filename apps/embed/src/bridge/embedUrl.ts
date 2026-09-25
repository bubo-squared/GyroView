import { PlaybackAttribute, SourceAttribute, ViewAttribute } from '@gyroview/player/attributes';

/**
 * What an embedding page may ask of the player, one option per `<gyro-view>` attribute, carried
 * to `embed.html` as query parameters named after the attributes.
 */
export interface EmbedOptions {
  readonly src: string;
  readonly src2?: string;
  readonly proxy?: string;
  readonly quality?: string;
  readonly fov?: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly stabilization?: string;
  readonly viewMode?: string;
  /**
   * `none` keeps the decoders idle until play.
   */
  readonly preload?: string;
  /**
   * `off` leaves the lenses' exposure as recorded.
   */
  readonly gainMatch?: string;
  readonly poster?: string;
  readonly autoplay?: boolean;
  readonly muted?: boolean;
  readonly loop?: boolean;
  /**
   * Default true.
   */
  readonly controls?: boolean;
}

/**
 * The query parameter naming the origin allowed to drive the frame.
 */
export const ORIGIN_PARAMETER = 'origin';

type StringOption =
  | 'src'
  | 'src2'
  | 'proxy'
  | 'quality'
  | 'stabilization'
  | 'viewMode'
  | 'preload'
  | 'gainMatch'
  | 'poster';
type NumberOption = 'fov' | 'yaw' | 'pitch';
type FlagOption = 'autoplay' | 'muted' | 'loop';

/**
 * Each option's query parameter, which is also the attribute it becomes on the element; records,
 * so an option cannot be left without one.
 */
const STRING_PARAMETERS: Readonly<Record<StringOption, string>> = {
  src: SourceAttribute.Src,
  src2: SourceAttribute.Src2,
  proxy: SourceAttribute.Proxy,
  quality: SourceAttribute.Quality,
  stabilization: PlaybackAttribute.Stabilization,
  viewMode: PlaybackAttribute.ViewMode,
  preload: PlaybackAttribute.Preload,
  gainMatch: PlaybackAttribute.GainMatch,
  poster: PlaybackAttribute.Poster,
};
const NUMBER_PARAMETERS: Readonly<Record<NumberOption, string>> = {
  fov: ViewAttribute.FieldOfView,
  yaw: ViewAttribute.Yaw,
  pitch: ViewAttribute.Pitch,
};
const FLAG_PARAMETERS: Readonly<Record<FlagOption, string>> = {
  autoplay: PlaybackAttribute.Autoplay,
  muted: PlaybackAttribute.Muted,
  loop: PlaybackAttribute.Loop,
};
const CONTROLS_PARAMETER = PlaybackAttribute.Controls;
const FLAG_ON = '1';
const FLAG_OFF = '0';
const TRUTHY = new Set(['1', 'true', 'yes', '']);

/**
 * The frame URL for a page at `embedderOrigin` wanting `options`.
 */
export function embedUrlFor(
  embedPageUrl: string,
  options: EmbedOptions,
  embedderOrigin: string,
): string {
  const url = new URL(embedPageUrl);
  for (const [option, parameter] of entriesOf(STRING_PARAMETERS)) {
    const value = options[option];
    if (value !== undefined) url.searchParams.set(parameter, value);
  }
  for (const [option, parameter] of entriesOf(NUMBER_PARAMETERS)) {
    const value = options[option];
    if (value !== undefined) url.searchParams.set(parameter, String(value));
  }
  for (const [option, parameter] of entriesOf(FLAG_PARAMETERS)) {
    if (options[option] === true) url.searchParams.set(parameter, FLAG_ON);
  }
  if (options.controls === false) url.searchParams.set(CONTROLS_PARAMETER, FLAG_OFF);
  url.searchParams.set(ORIGIN_PARAMETER, embedderOrigin);
  return url.href;
}

export interface EmbedPageRequest {
  /**
   * Attributes to put on the element; boolean attributes have the empty string.
   */
  readonly attributes: Readonly<Record<string, string>>;
  readonly embedderOrigin: string | undefined;
}

/**
 * Reads a frame URL's query back into element attributes.
 */
export function embedPageRequestOf(query: URLSearchParams): EmbedPageRequest {
  const attributes: Record<string, string> = {};
  const valued = [...Object.values(STRING_PARAMETERS), ...Object.values(NUMBER_PARAMETERS)];
  for (const name of valued) {
    const value = query.get(name);
    if (value !== null && value !== '') attributes[name] = value;
  }
  for (const name of flagAttributesOf(query)) attributes[name] = '';
  return { attributes, embedderOrigin: query.get(ORIGIN_PARAMETER) ?? undefined };
}

/**
 * The boolean attributes the query switches on; controls are on unless switched off.
 */
function flagAttributesOf(query: URLSearchParams): readonly string[] {
  const flags = Object.values(FLAG_PARAMETERS).filter((name) => isFlagOn(query.get(name)));
  const controls = query.get(CONTROLS_PARAMETER);
  return controls === null || isFlagOn(controls) ? [...flags, CONTROLS_PARAMETER] : flags;
}

function isFlagOn(value: string | null): boolean {
  return value !== null && TRUTHY.has(value.toLowerCase());
}

/**
 * `Object.entries` with the record's own key type, which TypeScript widens to `string`.
 */
function entriesOf<Key extends string>(
  record: Readonly<Record<Key, string>>,
): readonly (readonly [Key, string])[] {
  return Object.entries(record) as [Key, string][];
}
