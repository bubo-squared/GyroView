/**
 * What an embedding page may ask of the player, mirrored one to one on `<gyro-view>`'s
 * attributes and carried to `embed.html` as query parameters.
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
  readonly projection?: string;
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

const STRING_PARAMETERS = [
  'src',
  'src2',
  'proxy',
  'quality',
  'stabilization',
  'projection',
] as const;
const NUMBER_PARAMETERS = ['fov', 'yaw', 'pitch'] as const;
const FLAG_PARAMETERS = ['autoplay', 'muted', 'loop'] as const;
const CONTROLS_PARAMETER = 'controls';
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
  for (const name of STRING_PARAMETERS) {
    const value = options[name];
    if (value !== undefined) url.searchParams.set(name, value);
  }
  for (const name of NUMBER_PARAMETERS) {
    const value = options[name];
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  for (const name of FLAG_PARAMETERS) {
    if (options[name] === true) url.searchParams.set(name, FLAG_ON);
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
  for (const name of [...STRING_PARAMETERS, ...NUMBER_PARAMETERS]) {
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
  const flags = FLAG_PARAMETERS.filter((name) => isFlagOn(query.get(name)));
  const controls = query.get(CONTROLS_PARAMETER);
  return controls === null || isFlagOn(controls) ? [...flags, CONTROLS_PARAMETER] : flags;
}

function isFlagOn(value: string | null): boolean {
  return value !== null && TRUTHY.has(value.toLowerCase());
}
