import { parseMarkup } from './parseMarkup';

/**
 * Wraps an icon's shapes in a 24-unit square. Shapes are stroked in `currentColor` unless they
 * say otherwise, so every icon takes the controls' text colour.
 */
function icon(shapes: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`;
}

const SPEAKER = '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" fill="currentColor"/>';

/**
 * The controls' icons, drawn as inline SVG in `currentColor` only: a text glyph is left to the
 * platform's fonts, some of which draw it as a colour emoji.
 */
export const ICONS = {
  play: icon('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  pause: icon(
    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  ),
  stop: icon(
    '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  ),
  sound: icon(`${SPEAKER}<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.5 6a8 8 0 0 1 0 12"/>`),
  muted: icon(`${SPEAKER}<path d="M16 9.5l5 5M21 9.5l-5 5"/>`),
  resetView: icon('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>'),
  stabilization: icon(
    '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M8.5 8.5v7M15.5 8.5v7"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  ),
  viewMode: icon(
    '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.5" ry="8.5"/><path d="M3.5 12h17"/>',
  ),
  fullscreen: icon('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
} satisfies Readonly<Record<string, string>>;

export type IconName = keyof typeof ICONS;

const parsedIcons = new Map<IconName, DocumentFragment>();

/**
 * A copy of an icon for a button to show; each is parsed once per page, so changing a button's
 * icon parses nothing.
 */
export function iconNode(name: IconName): Node {
  let parsed = parsedIcons.get(name);
  if (!parsed) {
    parsed = parseMarkup(ICONS[name]);
    parsedIcons.set(name, parsed);
  }
  return parsed.cloneNode(true);
}
